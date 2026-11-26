"""Provas de bloqueio independentes da cobertura efetiva do ERP."""
import unittest
from collections import defaultdict
from coverage import MODULES, evaluate


class CoverageGateTest(unittest.TestCase):
    def test_new_lines_threshold_is_inclusive_even_for_small_changes(self):
        data = {root+"Example": {1: [1,1,0,0]} for root in MODULES.values()}
        path = MODULES["frontend/engenharia"]+"Example"
        data[path] = {n: [int(n != 10),1,0,0] for n in range(1, 101)}
        selected = defaultdict(set, {path: set(range(1, 11))})
        self.assertEqual(evaluate(data, selected)[1], [])
        data[path][9][0] = 0
        self.assertEqual(evaluate(data, selected)[1], ["frontend/engenharia/alterado linhas: 8/10"])

    def test_single_module_and_diff(self):
        data = {p+"Example": {1: [100,100,100,100], 2: [1,1,1,1]} for p in MODULES.values()}
        target = MODULES["backend/acesso"]+"Example"
        selected = defaultdict(set, {target: {2}})
        data[target][2] = [0,1,0,1]
        _, errors = evaluate(data,selected)
        self.assertEqual(len(errors), 2)
        self.assertTrue(all("alterado" in e for e in errors))
        data[target][1] = [100,100,80,100]
        self.assertIn("backend/acesso/total branches: 80/101",evaluate(data,selected)[1])
        del data[target]
        self.assertIn("Relatório ausente: backend/acesso",evaluate(data,selected)[1])


if __name__ == "__main__":
    unittest.main()
