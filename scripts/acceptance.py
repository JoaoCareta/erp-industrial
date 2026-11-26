"""Reconcilia cenários de aceite com resultados JUnit produzidos nesta execução."""
from pathlib import Path
from xml.etree import ElementTree as ET
import json

suites = {
    "integracao": ("build/test-results/test/TEST-*.xml", [
        "scopedRoles()", "sectorAndSuspension()", "preservesPublishedVersions()", "rejectsInvalidCatalogsAndDrafts()",
        "concurrentRetryAndImmutableHistory()", "httpErrorsAndReadiness()", "moduleBoundaries()"]),
    "contrato": ("build/test-results/test/TEST-*.xml", ["openApiMatchesHandlers()"]),
    "interface": ("reports/ui.xml", ["UI-A1 carregamento, equipe, lista vazia, erro e saída",
        "seleção de unidade, setores e revogação", "entrada indisponível e conta suspensa",
        "UI-E2 cadastros, rascunho e histórico consultável", "inicialização OIDC, renovação e saída", "login indisponível"]),
    "e2e": ("reports/*.xml", ["setor e suspensão com o mesmo token", "funcionário sem concessão","regional escolhe e retoma a unidade",
        "publica V1 e V2 e preserva a composição e o roteiro", "histórico após reiniciar a API"]),
}
report = {}
for suite, (pattern, expected) in suites.items():
    passed = {case.attrib["name"] for path in Path(".").glob(pattern)
              for case in ET.parse(path).iter("testcase")
              if all(case.find(tag) is None for tag in ("failure", "error", "skipped"))}
    missing = sorted(set(expected) - passed)
    report[suite] = {"passed":len(expected)-len(missing),"total":len(expected),"missing":missing}
print(json.dumps(report, indent=2, ensure_ascii=False))
Path("reports/acceptance.json").write_text(json.dumps(report, indent=2))
if any(s["missing"] for s in report.values()):
    raise SystemExit("Cenário obrigatório sem teste aprovado")
