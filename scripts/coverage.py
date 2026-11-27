"""Aplica a política do plano mestre aos relatórios JaCoCo e LCOV."""
import argparse
import json
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

MODULES = {
    "backend/fundacao": "src/main/kotlin/erp/",
    "backend/acesso": "src/main/kotlin/erp/access/",
    "backend/engenharia": "src/main/kotlin/erp/engineering/",
    "backend/estoque": "src/main/kotlin/erp/stock/",
    "backend/producao": "src/main/kotlin/erp/production/",
    "frontend/acesso": "frontend/src/",
    "frontend/engenharia": "frontend/src/engineering/",
    "frontend/estoque": "frontend/src/stock/",
    "frontend/producao": "frontend/src/production/",
}


def observations():
    data = defaultdict(dict)
    report = ET.parse("build/reports/jacoco/test/jacocoTestReport.xml")
    for package in report.findall("package"):
        for source in package.findall("sourcefile"):
            path = "src/main/kotlin/{}/{}".format(package.get("name"), source.get("name"))
            for line in source.findall("line"):
                cb, mb = int(line.get("cb")), int(line.get("mb"))
                data[path][int(line.get("nr"))] = [int(int(line.get("ci")) > 0), 1, cb, cb + mb]
    for record in Path("frontend/coverage/lcov.info").read_text().splitlines():
        tag, _, value = record.partition(":")
        if tag == "SF":
            path = "frontend/" + value.replace(chr(92), "/")
        elif tag in ("DA", "BRDA"):
            parts = value.split(",")
            entry = data[path].setdefault(int(parts[0]), [0, 0, 0, 0])
            if tag == "DA":
                entry[:2] = [int(int(parts[1]) > 0), 1]
            else:
                entry[2] += int(parts[3] != "-" and int(parts[3]) > 0)
                entry[3] += 1
    return data


def changes(base):
    if not base:
        return None
    diff = subprocess.check_output(["git", "diff", "--no-ext-diff", "--no-renames", "-U0",
                                    base + "...HEAD", "--", *MODULES.values()], text=True, encoding="utf8")
    selected = defaultdict(set)
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            path = line[6:]
        elif line.startswith("@@"):
            start, count = re.search(r"\+(\d+)(?:,(\d+))? @@", line).groups()
            selected[path].update(range(int(start), int(start) + int(count or 1)))
    return selected


def evaluate(data, selected):
    result = {}
    errors = []
    for module, root in MODULES.items():
        files = [p for p in data if max((r for r in MODULES.values() if p.startswith(r)), key=len, default="") == root]
        if not files:
            errors.append("Relatório ausente: " + module)
        for scope in ["total", "alterado"]:
            metrics = [0, 0, 0, 0]
            missing = []
            for path in files:
                for line, counters in data[path].items():
                    if scope == "alterado" and selected is not None and line not in selected[path]:
                        continue
                    metrics = [a+b for a, b in zip(metrics, counters)]
                    if counters[0] < counters[1] or counters[2] < counters[3]:
                        missing.append(f"{path}:{line}")
            key = module + "/" + scope
            result[key] = dict(lines=metrics[:2], branches=metrics[2:], gaps=missing)
            for name, hit, total in [("linhas", *metrics[:2]), ("branches", *metrics[2:])]:
                if hit * 100 < total * 90:
                    errors.append(f"{key} {name}: {hit}/{total}")
    return result, errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base")
    base = parser.parse_args().base
    data = observations()
    sources = {p.as_posix() for root, ext in [("src/main/kotlin", "*.kt"), ("frontend/src", "*.ts*")]
               for p in Path(root).rglob(ext)}
    result, errors = evaluate(data, changes(base))
    errors += ["Arquivo sem relatório: " + p for p in sources.difference(data)]
    Path("reports").mkdir(exist_ok=True)
    Path("reports/coverage.json").write_text(json.dumps(dict(base=base,modules=result), indent=2))
    for key, summary in result.items():
        print(key, "linhas", summary["lines"], "branches", summary["branches"])
    if errors:
        raise SystemExit("\n".join(errors))
