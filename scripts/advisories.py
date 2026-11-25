"""Confere os artefatos Maven resolvidos contra os avisos publicados no OSV."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import urllib.request


def fetch(url, body=None):
    payload = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as response:
        return json.load(response)


def inspect(advisory):
    doc = fetch("https://api.osv.dev/v1/vulns/" + advisory)
    level = doc.get("database_specific", {}).get("severity")
    if not level:
        score = fetch("https://api.deps.dev/v3/advisories/" + advisory).get("cvss3Score")
        if score is None:
            raise ValueError("Severidade pendente de análise: " + advisory)
        level = "CRITICAL" if score >= 9 else "HIGH" if score >= 7 else "MEDIUM" if score >= 4 else "LOW"
    return advisory, level


coordinates = [s.split("=")[0] for s in Path("gradle.lockfile").read_text().splitlines()
               if s and not s.startswith("#") and ":" in s]
packages = [c.rsplit(":", 1) for c in coordinates]
queries = [{"package": {"ecosystem": "Maven", "name": name}, "version": version} for name, version in packages]
matches = fetch("https://api.osv.dev/v1/querybatch", {"queries": queries})["results"]
if len(matches) != len(queries):
    raise RuntimeError("Inventário Maven incompleto")
advisories = {}
for coordinate, result in zip(coordinates, matches):
    for issue in result.get("vulns", []):
        advisories.setdefault(issue["id"], []).append(coordinate)
with ThreadPoolExecutor(max_workers=8) as pool:
    levels = dict(pool.map(inspect, advisories))
Path("reports").mkdir(exist_ok=True)
report = {i: {"severity": levels[i], "packages": p} for i,p in advisories.items()}
Path("reports/maven-advisories.json").write_text(json.dumps(report, indent=2))
critical = [i for i in levels if levels[i] == "CRITICAL"]
print(f"{len(packages)} dependências Maven consultadas; {len(critical)} avisos críticos.")
if critical:
    raise SystemExit(", ".join(critical))
