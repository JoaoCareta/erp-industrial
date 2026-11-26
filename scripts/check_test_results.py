"""Exige pelo menos um caso unitário executado com sucesso nos relatórios JUnit."""
import sys
from xml.etree import ElementTree


def passed(path):
    return sum(all(case.find(tag) is None for tag in ("skipped", "failure", "error"))
               for case in ElementTree.parse(path).iter("testcase"))


if __name__ == "__main__":
    count = sum(passed(path) for path in sys.argv[1:])
    if not count:
        raise SystemExit("Nenhum teste unitário aprovado")
    print(f"{count} testes unitários aprovados")
