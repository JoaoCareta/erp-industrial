import unittest

from pull_release import eligible, select_artifact


class PullReleaseTest(unittest.TestCase):
    def test_only_push_from_master_in_the_production_repository_is_eligible(self):
        run = dict(event="push", head_branch="master", status="in_progress", run_number=15,
                   path=".github/workflows/verify.yml", head_sha="a" * 40,
                   head_repository={"full_name": "JoaoCareta/erp-industrial"})
        self.assertTrue(eligible(run, 14))
        for change in (dict(event="pull_request"), dict(head_branch="feature"), dict(status="completed"),
                       dict(run_number=13), dict(head_repository={"full_name": "fork/erp-industrial"})):
            self.assertFalse(eligible(dict(run, **change), 14))

    def test_retries_use_only_the_current_attempt(self):
        artifact = dict(name="production-2", expired=False, id=91)
        self.assertEqual(select_artifact([artifact, dict(artifact, name="production-1")], 2), artifact)
        self.assertIsNone(select_artifact([dict(artifact, expired=True)], 2))


if __name__ == "__main__":
    unittest.main()
