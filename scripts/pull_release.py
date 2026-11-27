"""Poll only verified production packages from the ERP workflow using Actions read access."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zipfile import ZipFile

from deploy_release import atomic_write, promote

REPO = "JoaoCareta/erp-industrial"
API = "https://api.github.com/repos/" + REPO + "/actions/"
STORE = Path.home() / ".local/share/erp-industrial"
CONFIG = Path.home() / ".config/erp-industrial"


class SecureRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme != "https":
            raise ValueError("Artifact download requires HTTPS.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def api(path, token):
    if path != "workflows/verify.yml/runs?event=push&branch=master&status=in_progress&per_page=100" and not (
            re.fullmatch(r"artifacts/[1-9][0-9]*/zip", path)
            or re.fullmatch(r"runs/[1-9][0-9]*/artifacts\?per_page=100", path)):
        raise ValueError("Unexpected Actions API route.")
    request = Request(API + path, headers={"User-Agent": "ERP-Industrial-Deployment/1.0"})
    # The signed artifact redirect goes to storage. Only GitHub receives this credential.
    request.add_unredirected_header("Authorization", "Bearer " + token)
    return build_opener(SecureRedirect()).open(request, timeout=60)


def eligible(run, active_run):
    return (run["event"] == "push" and run["head_branch"] == "master"
            and run["head_repository"]["full_name"] == REPO and run["status"] == "in_progress"
            and run["path"] == ".github/workflows/verify.yml" and run["run_number"] >= active_run
            and re.fullmatch("[0-9a-f]{40}", run["head_sha"]) is not None)


def select_artifact(artifacts, attempt):
    name = "production-{}".format(attempt)
    return next((a for a in artifacts if a["name"] == name and not a["expired"]), None)


def install(run, artifact, token, config):
    with tempfile.TemporaryDirectory(dir=str(STORE)) as tmp:
        archive = Path(tmp) / "artifact.zip"
        digest = hashlib.sha256()
        artifact_id = quote(str(int(artifact["id"])), safe="")
        with api("artifacts/{}/zip".format(artifact_id), token) as reply, archive.open("wb") as output:
            for chunk in iter(lambda: reply.read(1024 * 1024), b""):
                output.write(chunk)
                digest.update(chunk)
        if artifact["digest"] != "sha256:" + digest.hexdigest():
            raise ValueError("GitHub artifact digest mismatch.")
        bundle = Path(tmp) / "release.tar.gz"
        with ZipFile(str(archive)) as package, package.open("release.tar.gz") as src, bundle.open("wb") as dst:
            shutil.copyfileobj(src, dst)
        promote(run["head_sha"], run["run_number"], bundle, config, STORE)


def poll():
    token = (CONFIG / "actions-token").read_text().strip()
    config = json.loads((CONFIG / "deploy.json").read_text())
    active = json.loads((STORE / "active.json").read_text())
    with api("workflows/verify.yml/runs?event=push&branch=master&status=in_progress&per_page=100", token) as reply:
        runs = json.load(reply)["workflow_runs"]
    for run in sorted(runs, key=lambda r: r["run_number"]):
        if not eligible(run, active["run"]):
            continue
        run_id = quote(str(int(run["id"])), safe="")
        with api("runs/{}/artifacts?per_page=100".format(run_id), token) as reply:
            artifact = select_artifact(json.load(reply)["artifacts"], run["run_attempt"])
        if artifact is None:
            continue
        release = {"sha": run["head_sha"], "run": run["run_number"]}
        if active != release:
            install(run, artifact, token, config)
            active = json.loads((STORE / "active.json").read_text())
        if active != release:
            raise RuntimeError("Production did not activate the expected merge.")
        receipt = dict(release, attempt=run["run_attempt"], artifact=artifact["id"])
        atomic_write(Path(config["web_root"]) / "erp-release.json", json.dumps(receipt).encode())


if __name__ == "__main__":
    import fcntl
    with (STORE / "deploy.lock").open("a") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        poll()
