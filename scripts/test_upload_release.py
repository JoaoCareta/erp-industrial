import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from upload_release import build_bundle, upload


class UploadReleaseTest(unittest.TestCase):
    def test_bundle_has_the_gradle_distribution_and_frontend_at_the_release_root(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            distribution = path / "erp-industrial"
            for folder, file in (("bin", "erp-industrial"), ("lib", "erp-industrial.jar")):
                (distribution / folder).mkdir(parents=True)
                (distribution / folder / file).write_bytes(b"api")
            web = path / "web"
            web.mkdir()
            (web / "index.html").write_bytes(b"web")
            api = path / "api"
            api.mkdir()
            with tarfile.open(api / "api.tar", "w") as original:
                original.add(distribution, arcname="erp-industrial")
            archive = build_bundle(api, web, path)
            with tarfile.open(archive) as result:
                self.assertEqual(result.extractfile("api/bin/erp-industrial").read(), b"api")
                self.assertEqual(result.extractfile("api/lib/erp-industrial.jar").read(), b"api")
                self.assertEqual(result.extractfile("web/index.html").read(), b"web")

    @patch("subprocess.run")
    @patch("subprocess.check_output", return_value=".erp-upload.a123456789\n")
    def test_upload_activates_exact_sha_and_cleans_only_its_staging_files(self, create, run):
        sha = "a" * 40
        upload("server.example", "erp", sha, "27", Path("release.tar.gz"), Path("key"), Path("pins"))
        self.assertIn("mktemp -d", create.call_args.args[0][-1])
        transfer, activate, cleanup = [call.args[0] for call in run.call_args_list]
        self.assertEqual(transfer[0], "scp")
        self.assertIn("Port=55", transfer)
        self.assertIn("StrictHostKeyChecking=yes", transfer)
        self.assertIn("UserKnownHostsFile=pins", transfer)
        self.assertIn("server.example:.erp-upload.a123456789/", transfer)
        self.assertIn(f'python3 deploy_release.py {sha} 27 "$PWD/release.tar.gz"', activate[-1])
        self.assertIn('rm -f -- release.tar.gz deploy_release.py', cleanup[-1])
        self.assertNotIn("rm -r", cleanup[-1])

    @patch("subprocess.run")
    @patch("subprocess.check_output", return_value=".erp-upload.a123456789\n")
    def test_failed_upload_stops_before_activation_and_cleans_staging(self, create, run):
        run.side_effect = [subprocess.CalledProcessError(1, "scp"), None]
        with self.assertRaises(subprocess.CalledProcessError):
            upload("server.example", "erp", "a" * 40, "27", Path("archive"), Path("key"), Path("pins"))
        self.assertEqual(run.call_count, 2)
        self.assertIn("rmdir", run.call_args.args[0][-1])

    @patch("subprocess.run")
    @patch("subprocess.check_output")
    def test_unusable_host_or_staging_path_never_receives_an_upload(self, create, run):
        args = ("erp", "a" * 40, "27", Path("archive"), Path("key"), Path("pins"))
        with self.assertRaises(ValueError):
            upload("-oProxyCommand=bad", *args)
        create.assert_not_called()
        create.return_value = "../other-user\n"
        with self.assertRaises(ValueError):
            upload("server.example", *args)
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
