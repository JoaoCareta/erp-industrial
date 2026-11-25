"""Confere o índice humano contra os arquivos de resolução usados pelo build."""
import json
import re
from pathlib import Path

package = json.loads(Path("frontend/package.json").read_text())
lock = json.loads(Path("frontend/package-lock.json").read_text())["packages"]
gradle = Path("gradle.lockfile").read_text().splitlines()
seen = set()
for line in Path("docs/versoes.md").read_text(encoding="utf8").splitlines():
    if " | [API]" not in line:
        continue
    name, version, _, source, *_ = [v.strip() for v in line.strip("|").split("|")]
    seen.add(name)
    if source == "gradle.lockfile":
        valid = any(s.startswith(f"{name}:{version}=") for s in gradle)
    elif source.endswith("package-lock.json"):
        valid = lock["node_modules/" + name]["version"] == version
    else:
        valid = version in Path(source).read_text()
    if not valid:
        raise SystemExit(f"Divergência no catálogo: {name} {version}")
required = set(package["dependencies"]) | set(package["devDependencies"])
required.update(re.findall(r'"([a-zA-Z][\w.-]+:[\w.-]+)(?::[^"]+)?"', Path("build.gradle.kts").read_text()))
if required - seen:
    raise SystemExit(f"Faltam dependências no catálogo: {required - seen}")
print(f"Catálogo verificado: {len(seen)} componentes.")
