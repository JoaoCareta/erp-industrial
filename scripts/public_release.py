"""Confirm that clients can reach the ERP and receive the verified frontend assets."""
import json
import os
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import URLError

from deploy_release import ISSUER, ORIGIN, fetch


class AssetLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("src", "href") and value and value.startswith("/assets/"):
                self.paths.add(value)


def links(markup):
    parser = AssetLinks()
    parser.feed(markup)
    return parser.paths


def verify(root):
    migrations = json.loads(fetch(ORIGIN + "/api/ready"))["migrations"]
    if type(migrations) is not int or migrations < 1:
        raise ValueError("Public API is not ready.")
    if json.loads(fetch(ISSUER + "/.well-known/openid-configuration"))["issuer"] != ISSUER:
        raise ValueError("Unexpected public issuer.")
    expected = links((root / "index.html").read_text(encoding="utf8"))
    if not expected or links(fetch(ORIGIN + "/").decode("utf8")) != expected:
        raise ValueError("Public index references a different release.")
    for asset in sorted((root / "assets").rglob("*")):
        if asset.is_file() and fetch(ORIGIN + "/" + asset.relative_to(root).as_posix()) != asset.read_bytes():
            raise ValueError("Different public asset: " + asset.name)


if __name__ == "__main__":
    if os.environ.get("ERP_ARTIFACT_ID"):
        expected = dict(sha=os.environ["GITHUB_SHA"], run=int(os.environ["GITHUB_RUN_NUMBER"]),
                        attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]), artifact=int(os.environ["ERP_ARTIFACT_ID"]))
        deadline = time.monotonic() + 600
        while time.monotonic() < deadline:
            try:
                if json.loads(fetch(ORIGIN + "/erp-release.json")) == expected:
                    break
            except (URLError, ValueError, TimeoutError):
                pass
            time.sleep(10)
        else:
            raise SystemExit("Production did not acknowledge this SHA and artifact within ten minutes.")
    verify(Path(sys.argv[1]))
