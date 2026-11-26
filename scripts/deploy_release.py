"""Install the tested web and JVM artifacts on the Mundo Eduk application host."""
import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
from http.client import HTTPException
from urllib.request import Request, urlopen
from uuid import uuid4

ORIGIN = "https://mundoeduk.lufan.com.br"
ISSUER = ORIGIN + "/auth/realms/industrial"


def unpack_release(bundle, destination):
    """Unpack only regular files and directories in the two artifact trees."""
    with tarfile.open(bundle, "r:gz") as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            if (not path.parts or path.parts[0] not in ("api", "web")
                    or ".." in path.parts or "\\" in member.name or ":" in member.name):
                raise ValueError("Unexpected release path: " + member.name)
            target = destination / path
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, target.open("xb") as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o755 if member.mode & 0o111 else 0o644)
            else:
                raise ValueError("Unexpected release entry: " + member.name)

    for name in ("web/index.html", "api/lib/erp-industrial.jar", "api/bin/erp-industrial"):
        if not (destination / name).is_file():
            raise ValueError("Incomplete release, missing " + name)


def atomic_write(path, data, mode=0o644):
    """Write on the destination filesystem so readers always see a complete file."""
    fd, staged = tempfile.mkstemp(dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(staged, mode)
        os.replace(staged, str(path))
    finally:
        if os.path.exists(staged):
            os.unlink(staged)


def current_lib(path):
    if not path.is_symlink():
        raise ValueError("Initialize the production API lib symlink during the MariaDB cutover.")
    return path.resolve(strict=True)


def switch_lib(link, target):
    with tempfile.TemporaryDirectory(dir=str(link.parent)) as temp:
        staged = Path(temp) / "lib"
        staged.symlink_to(target, target_is_directory=True)
        os.replace(str(staged), str(link))


def publish_assets(source, web):
    """Retain old hashed assets so already-open pages can still load their code."""
    docroot = web.resolve()
    for item in source.rglob("*"):
        relative = item.relative_to(source)
        if relative == Path("index.html"):
            continue
        if relative.parts[0] != "assets":
            raise ValueError("Unexpected web artifact outside assets: " + str(relative))
        target = docroot / relative
        if target.resolve() != target or target.is_symlink():
            raise ValueError("Unexpected symlink in the Apache assets directory: " + str(relative))
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
            continue
        data = item.read_bytes()
        if target.exists():
            if target.read_bytes() != data:
                raise ValueError("A published asset already has different content: " + str(relative))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            atomic_write(target, data)


def fetch(url):
    request = Request(url + "?erp_check=" + uuid4().hex, headers={"Cache-Control": "no-cache"})
    with urlopen(request, timeout=5) as response:
        return response.read()


def wait_ready(expected_index=None):
    deadline = time.monotonic() + 120
    while True:
        try:
            migrations = json.loads(fetch(ORIGIN + "/api/ready"))["migrations"]
            if type(migrations) is not int or migrations < 1:
                raise ValueError("The public API has not confirmed its migrations.")
            if json.loads(fetch(ISSUER + "/.well-known/openid-configuration"))["issuer"] != ISSUER:
                raise ValueError("Unexpected public OIDC issuer.")
            if expected_index is not None and fetch(ORIGIN + "/") != expected_index:
                raise ValueError("The public frontend is serving a different index.")
            return
        except (OSError, HTTPException, ValueError, KeyError, TypeError) as error:
            if time.monotonic() >= deadline:
                raise RuntimeError("Public release checks failed: " + str(error)) from error
            time.sleep(2)


def promote(sha, run_number, bundle, config, store):
    """Activate under the host lock. A persistent journal recovers interrupted restarts."""
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or run_number < 1:
        raise ValueError("Invalid Git SHA or Actions run number.")
    link, web = (Path(config[key]).expanduser() for key in ("api_lib", "web_root"))
    command = config["restart_api"]
    if not isinstance(command, list) or not command or not all(isinstance(arg, str) and arg for arg in command):
        raise ValueError("restart_api must be a nonempty argument list.")
    if not link.is_absolute() or not web.is_absolute() or not (web / "index.html").is_file() or not (web / "assets").is_dir():
        raise ValueError("Configure absolute API and Apache paths for the existing site.")
    docroot = web.resolve()
    for private in (store.resolve(), link.parent.resolve()):
        if docroot == private or docroot in private.parents:
            raise ValueError("The API and private release storage must be outside the document root.")
    active = store / "active.json"
    pending = store / "pending.json"
    backup = store / "previous-index.html"
    state = json.loads(active.read_text(encoding="utf8")) if active.exists() else {"run": 0}

    def restart_api():
        subprocess.run(command, cwd=str(Path.home()), check=True, stdin=subprocess.DEVNULL, timeout=120)

    def restore(previous):
        previous_index = backup.read_bytes()
        atomic_write(web / "index.html", previous_index)
        switch_lib(link, Path(previous["previous_lib"]))
        restart_api()
        wait_ready(previous_index)
        pending.unlink()

    if pending.exists():
        attempt = json.loads(pending.read_text(encoding="utf8"))
        if state == attempt["release"]:
            pending.unlink()
        else:
            restore(attempt)
    release = {"sha": sha, "run": run_number}
    if state["run"] >= run_number:
        if state["run"] == run_number and state != release:
            raise ValueError("This workflow run already published a different commit.")
        print("This release is already active or a newer run was deployed.")
        return

    previous_lib = current_lib(link)
    if not any(previous_lib.glob("mariadb-java-client*.jar")):
        raise ValueError("Complete the PostgreSQL to MariaDB cutover before automatic deployment.")
    releases = store / "releases"
    releases.mkdir(exist_ok=True)
    directory = releases / ("{}-{}".format(run_number, sha))
    if not directory.exists():
        with tempfile.TemporaryDirectory(dir=str(releases)) as temp:
            staged = Path(temp) / "release"
            unpack_release(bundle, staged)
            if not any((staged / "api/lib").glob("mariadb-java-client*.jar")):
                raise ValueError("Release is missing the MariaDB driver.")
            os.rename(str(staged), str(directory))
    publish_assets(directory / "web", web)
    index = (directory / "web/index.html").read_bytes()
    atomic_write(backup, (web / "index.html").read_bytes(), mode=0o600)
    attempt = {"release": release, "previous_lib": str(previous_lib)}
    atomic_write(pending, json.dumps(attempt).encode(), mode=0o600)
    try:
        switch_lib(link, directory / "api/lib")
        restart_api()
        wait_ready()
        atomic_write(web / "index.html", index)
        wait_ready(index)
        atomic_write(active, json.dumps(release).encode(), mode=0o600)
    except Exception:
        restore(attempt)
        raise
    pending.unlink()
    print("Published {}".format(sha))


if __name__ == "__main__":
    import fcntl

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sha")
    parser.add_argument("run_number", type=int)
    parser.add_argument("bundle", type=Path)
    args = parser.parse_args()
    store = Path.home() / ".local/share/erp-industrial"
    store.mkdir(mode=0o700, parents=True, exist_ok=True)
    config = json.loads((Path.home() / ".config/erp-industrial/deploy.json").read_text(encoding="utf8"))
    with (store / "deploy.lock").open("a") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        promote(args.sha, args.run_number, args.bundle, config, store)
