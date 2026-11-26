"""Verify the pull request that made a commit eligible for deployment."""
import json
import subprocess
import unittest
from unittest.mock import patch

from merged_release import is_merged_release


class MergedReleaseTest(unittest.TestCase):
    repository = "example/erp"
    branch = "master"
    sha = "a" * 40

    def pull(self, *, branch="master", sha=None, merged=True):
        return {
            "base": {"ref": branch, "repo": {"full_name": self.repository}},
            "merge_commit_sha": sha or self.sha,
            "merged_at": "2026-11-26T12:00:00Z" if merged else None,
        }

    @patch("subprocess.check_output")
    def test_recognizes_exact_merge_on_a_later_page(self, api):
        api.return_value = json.dumps([[self.pull(merged=False)], [self.pull()]])
        self.assertTrue(is_merged_release(self.repository, self.branch, self.sha))
        command = api.call_args.args[0]
        self.assertIn("--paginate", command)
        self.assertIn("--slurp", command)
        self.assertIn(f"repos/{self.repository}/commits/{self.sha}/pulls?per_page=100", command)

    @patch("subprocess.check_output")
    def test_direct_push_or_unrelated_merges_do_not_deploy(self, api):
        wrong_repository = self.pull()
        wrong_repository["base"]["repo"]["full_name"] = "example/another-erp"
        for pulls in ([], [self.pull(merged=False)], [self.pull(branch="develop")],
                      [self.pull(sha="b" * 40)], [wrong_repository]):
            with self.subTest(pulls=pulls):
                api.return_value = json.dumps([pulls])
                self.assertFalse(is_merged_release(self.repository, self.branch, self.sha))

    @patch("subprocess.check_output")
    def test_api_error_fails_the_job(self, api):
        api.side_effect = subprocess.CalledProcessError(1, "gh api")
        with self.assertRaises(subprocess.CalledProcessError):
            is_merged_release(self.repository, self.branch, self.sha)


if __name__ == "__main__":
    unittest.main()
