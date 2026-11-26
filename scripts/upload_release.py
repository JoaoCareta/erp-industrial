"""Deliver the API and web artifacts from the verified Actions run to the ERP host."""
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile


def build_bundle(api, web, work):
    archives = list(api.glob("*.tar"))
    if len(archives) != 1 or not (web / "index.html").is_file():
        raise ValueError("Expected one Gradle distribution tar and the built web application.")
    extracted = work / "distribution"
    with tarfile.open(archives[0]) as distribution:
        distribution.extractall(extracted, filter="data")
    roots = list(extracted.iterdir())
    required = ("bin/erp-industrial", "lib/erp-industrial.jar")
    if len(roots) != 1 or not all((roots[0] / name).is_file() for name in required):
        raise ValueError("The API artifact is missing the ERP launcher or runtime libraries.")
    bundle = work / "release.tar.gz"
    with tarfile.open(bundle, "w:gz", compresslevel=1) as release:
        release.add(roots[0], arcname="api")
        release.add(web, arcname="web")
    return bundle


def upload(host, user, sha, run_number, bundle, key, pins):
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9.-]*", host) or not re.fullmatch(r"[a-zA-Z0-9_][a-zA-Z0-9._-]*", user):
        raise ValueError("Configure the ERP deployment hostname and SSH account.")
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or not re.fullmatch(r"[1-9][0-9]*", run_number):
        raise ValueError("Expected a Git commit SHA and Actions run number.")
    options = ["-o", "Port=55", "-o", f"User={user}", "-i", str(key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=20",
               "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes",
               "-o", f"UserKnownHostsFile={pins}", "-o", "GlobalKnownHostsFile=/dev/null"]
    ssh = ["ssh", *options, host]
    stage = subprocess.check_output([*ssh, 'cd "$HOME" && umask 077 && mktemp -d .erp-upload.XXXXXXXXXX'],
                                    text=True).strip()
    if not re.fullmatch(r"\.erp-upload\.[a-zA-Z0-9]{10}", stage):
        raise ValueError("SSH did not return the private staging directory.")
    enter = f'cd "$HOME/{stage}"'
    try:
        subprocess.run(["scp", *options, str(bundle), "scripts/deploy_release.py", f"{host}:{stage}/"], check=True)
        subprocess.run([*ssh, f'{enter} && python3 deploy_release.py {sha} {run_number}'], check=True)
    finally:
        subprocess.run([*ssh, f'{enter} && rm -f -- release.tar.gz deploy_release.py && cd .. && rmdir -- {stage}'],
                       check=True)


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(dir=os.environ["RUNNER_TEMP"]) as temp:
        work = Path(temp)
        archive = build_bundle(Path("artifacts/api"), Path("artifacts/web"), work)
        key = work / "identity"
        key.touch(mode=0o600)
        pins = work / "known_hosts"
        for path, variable in ((key, "ERP_DEPLOY_SSH_KEY"), (pins, "ERP_DEPLOY_KNOWN_HOSTS")):
            value = os.environ.pop(variable).replace("\r\n", "\n").strip()
            if not value:
                raise ValueError(f"Missing production secret {variable}.")
            path.write_text(value + "\n", encoding="utf8")
        upload(os.environ["ERP_DEPLOY_HOST"], os.environ["ERP_DEPLOY_USER"], os.environ["GITHUB_SHA"],
               os.environ["GITHUB_RUN_NUMBER"], archive, key, pins)
