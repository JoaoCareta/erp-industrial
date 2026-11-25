"""Usa a cadeia de confiança do sistema para obter a distribuição verificada do wrapper."""
import hashlib
import os
from pathlib import Path
import shutil
import tempfile
import urllib.request

props = dict(line.split("=",1) for line in Path("gradle/wrapper/gradle-wrapper.properties").read_text().splitlines() if "=" in line)
url = props["distributionUrl"].replace("\\:", ":")
archive = url.split("/")[-1]
number = int.from_bytes(hashlib.md5(url.encode(), usedforsecurity=False).digest(), "big")
key = ""
while number:
    number, digit = divmod(number, 36)
    key = "0123456789abcdefghijklmnopqrstuvwxyz"[digit] + key
root = Path(os.environ.get("GRADLE_USER_HOME", Path.home() / ".gradle"))
folder = root / props["distributionPath"] / archive.removesuffix(".zip") / key
folder.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile(dir=folder, delete=False) as out:
    temp = Path(out.name)
try:
    with urllib.request.urlopen(url, timeout=60) as source, temp.open("wb") as target:
        shutil.copyfileobj(source, target)
    digest = hashlib.sha256()
    with temp.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != props["distributionSha256Sum"]:
        raise ValueError("SHA-256 da distribuição diverge do wrapper")
    temp.replace(folder / archive)
finally:
    temp.unlink(missing_ok=True)
