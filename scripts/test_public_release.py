import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from public_release import verify


class PublicReleaseTest(unittest.TestCase):
    @patch("public_release.fetch")
    def test_cdn_markup_is_allowed_but_changed_assets_are_rejected(self, fetch):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "assets").mkdir()
            (root / "assets/app.js").write_bytes(b"app")
            (root / "index.html").write_text('<script src="/assets/app.js"></script>')
            responses = [b'{"migrations":3}', b'{"issuer":"https://mundoeduk.lufan.com.br/auth/realms/industrial"}',
                         b'<script src="/cdn/loader.js"></script><script src="/assets/app.js"></script>']
            fetch.side_effect = responses + [b"app"]
            verify(root)
            fetch.side_effect = responses + [b"stale"]
            with self.assertRaisesRegex(ValueError, "app.js"):
                verify(root)


if __name__ == "__main__":
    unittest.main()
