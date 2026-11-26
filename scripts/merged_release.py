"""Identify the merged pull request that introduced this default-branch tip."""
import json
import os
import subprocess


def is_merged_release(repository, branch, sha):
    endpoint = f"repos/{repository}/commits/{sha}/pulls?per_page=100"
    pages = json.loads(subprocess.check_output([
        "gh", "api", "--paginate", "--slurp", "-H", "X-GitHub-Api-Version: 2022-11-28", endpoint,
    ]))
    return any(
        pull["merged_at"] is not None
        and pull["merge_commit_sha"] == sha
        and pull["base"]["ref"] == branch
        and pull["base"]["repo"]["full_name"] == repository
        for page in pages for pull in page
    )


if __name__ == "__main__":
    merged = is_merged_release(os.environ["GITHUB_REPOSITORY"], os.environ["DEFAULT_BRANCH"], os.environ["GITHUB_SHA"])
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf8") as output:
        print(f"merged={str(merged).lower()}", file=output)
