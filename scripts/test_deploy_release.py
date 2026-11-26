"""Local regression checks for installing the workflow's two build artifacts."""
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from deploy_release import ISSUER, promote, publish_assets, unpack_release, wait_ready


class ReleaseBundleTest(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory()
        self.addCleanup(workspace.cleanup)
        self.root = Path(workspace.name)
        self.bundle = self.root / "release.tar.gz"
        self.destination = self.root / "release"
        self.destination.mkdir()

    def archive(self, files):
        with tarfile.open(self.bundle, "w:gz") as tar:
            for name, content in files.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(content)
                tar.addfile(entry, io.BytesIO(content))

    def test_installs_web_and_jvm_distribution(self):
        self.archive({"web/index.html": b"ERP", "api/lib/erp-industrial.jar": b"jar",
                      "api/bin/erp-industrial": b"launcher"})
        unpack_release(self.bundle, self.destination)
        self.assertEqual((self.destination / "web/index.html").read_bytes(), b"ERP")
        self.assertEqual((self.destination / "api/lib/erp-industrial.jar").read_bytes(), b"jar")

    def test_incomplete_bundle_is_rejected_before_activation(self):
        self.archive({"web/index.html": b"ERP"})
        with self.assertRaises(ValueError):
            unpack_release(self.bundle, self.destination)

    def test_archive_cannot_write_outside_its_release(self):
        self.archive({"../unexpected": b"wrong destination"})
        with self.assertRaises(ValueError):
            unpack_release(self.bundle, self.destination)
        self.assertFalse((self.root / "unexpected").exists())

    def deployment(self):
        web, previous = self.root / "www", self.root / "original-lib"
        (web / "assets").mkdir(parents=True)
        (web / "index.html").write_bytes(b"previous index")
        (web / ".htaccess").write_bytes(b"Apache configuration")
        (web / "assets/previous.js").write_bytes(b"old bundle")
        previous.mkdir()
        (previous / "mariadb-java-client-3.jar").touch()
        self.link = self.root / "lib"
        if os.name == "nt":
            # Windows test sessions can lack permission to create directory symlinks.
            self.link.write_text(str(previous))
            for method, fake in (("current_lib", lambda p: Path(p.read_text())),
                                 ("switch_lib", lambda p, t: p.write_text(str(t)))):
                replacement = patch("deploy_release." + method, side_effect=fake)
                replacement.start()
                self.addCleanup(replacement.stop)
            self.active = lambda: Path(self.link.read_text())
        else:
            self.link.symlink_to(previous, target_is_directory=True)
            self.active = self.link.resolve
        self.config = {"api_lib": str(self.link), "web_root": str(web), "restart_api": ["restart-api-only"]}
        self.store = self.root / "state"
        self.store.mkdir()
        self.archive({"web/index.html": b"new index", "web/assets/current-abcd.js": b"new bundle",
                      "api/lib/erp-industrial.jar": b"jar", "api/lib/mariadb-java-client-3.jar": b"driver",
                      "api/bin/erp-industrial": b"launcher"})
        return web, previous

    @patch("deploy_release.wait_ready")
    @patch("subprocess.run")
    def test_publishes_and_skips_duplicate_and_older_workflows(self, restart, health):
        web, _ = self.deployment()
        def observe(expected=None):
            self.assertEqual((web / "index.html").read_bytes(), expected or b"previous index")
        health.side_effect = observe
        sha = "a" * 40
        promote(sha, 23, self.bundle, self.config, self.store)
        self.assertEqual(self.active(), self.store / "releases" / ("23-" + sha) / "api/lib")
        self.assertEqual((web / "assets/previous.js").read_bytes(), b"old bundle")
        self.assertEqual((web / "assets/current-abcd.js").read_bytes(), b"new bundle")
        self.assertEqual((web / ".htaccess").read_bytes(), b"Apache configuration")
        self.assertEqual(json.loads((self.store / "active.json").read_text()), {"sha": sha, "run": 23})
        promote(sha, 23, self.bundle, self.config, self.store)
        promote("b" * 40, 22, self.bundle, self.config, self.store)
        self.assertEqual(restart.call_count, 1)

    @patch("deploy_release.wait_ready")
    @patch("subprocess.run")
    def test_unhealthy_api_or_public_page_restores_previous_release(self, restart, health):
        web, previous = self.deployment()
        for results in ([RuntimeError("API unavailable"), None], [None, RuntimeError("stale HTML"), None]):
            with self.subTest(results=results):
                health.side_effect = results
                with self.assertRaises(RuntimeError):
                    promote("b" * 40, 24, self.bundle, self.config, self.store)
                self.assertEqual(self.active(), previous)
                self.assertEqual((web / "index.html").read_bytes(), b"previous index")
                self.assertFalse((self.store / "active.json").exists())
                self.assertFalse((self.store / "pending.json").exists())
        self.assertEqual(restart.call_count, 4)
        self.assertEqual([call.kwargs["cwd"] for call in restart.call_args_list], [str(Path.home())] * 4)

    def test_asset_below_a_linked_directory_cannot_escape_the_document_root(self):
        source, web, outside = (self.root / name for name in ("build", "www", "outside"))
        relative = Path("assets/images/logo.svg")
        asset = source / relative
        asset.parent.mkdir(parents=True)
        asset.write_bytes(b"logo")
        (web / "assets").mkdir(parents=True)
        outside.mkdir()
        alias = web / relative.parent
        if os.name == "nt":
            # Model the resolved path when the Windows session lacks symlink privileges.
            alias.mkdir()
            resolve = Path.resolve
            replacement = patch.object(Path, "resolve", lambda p: outside / asset.name
                                       if p == web / relative else resolve(p))
            replacement.start()
            self.addCleanup(replacement.stop)
        else:
            alias.symlink_to(outside, target_is_directory=True)
        # Revalidate the individual file even if its parent was visited before it became a link.
        with patch.object(Path, "rglob", return_value=[asset]), self.assertRaises(ValueError):
            publish_assets(source, web)
        self.assertFalse((outside / asset.name).exists())

    @patch("deploy_release.wait_ready")
    @patch("subprocess.run")
    def test_interrupted_activation_recovers_before_retry(self, restart, health):
        web, previous = self.deployment()
        sha = "b" * 40
        # BaseException simulates the worker being killed midway through activation.
        health.side_effect = KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            promote(sha, 24, self.bundle, self.config, self.store)
        self.assertTrue((self.store / "pending.json").exists())
        restored = []
        health.side_effect = lambda expected=None: restored.append((self.active(), expected))
        promote(sha, 24, self.bundle, self.config, self.store)
        self.assertEqual(restored[0], (previous, b"previous index"))
        self.assertEqual((web / "index.html").read_bytes(), b"new index")
        self.assertFalse((self.store / "pending.json").exists())

    @patch("subprocess.run")
    def test_conflicting_hashed_asset_preserves_healthy_site(self, restart):
        web, previous = self.deployment()
        collision = web / "assets/current-abcd.js"
        collision.write_bytes(b"existing immutable content")
        with self.assertRaisesRegex(ValueError, "different content"):
            promote("c" * 40, 25, self.bundle, self.config, self.store)
        self.assertEqual(collision.read_bytes(), b"existing immutable content")
        self.assertEqual((web / "index.html").read_bytes(), b"previous index")
        self.assertEqual(self.active(), previous)
        restart.assert_not_called()

    @patch("deploy_release.fetch")
    def test_public_checks_require_migrations_expected_issuer_and_published_index(self, fetch):
        migrations = b'{"migrations":3}'
        discovery = json.dumps({"issuer": ISSUER}).encode()
        fetch.side_effect = [migrations, discovery, b"published"]
        wait_ready(b"published")
        for responses in ([b'{"migrations":0}'], [migrations, b'{"issuer":"wrong"}'],
                          [migrations, discovery, b"previous"]):
            with self.subTest(responses=responses), patch("time.monotonic", side_effect=[0, 121]):
                fetch.side_effect = responses
                with self.assertRaisesRegex(RuntimeError, "Public release checks failed"):
                    wait_ready(b"published")


if __name__ == "__main__":
    unittest.main()
