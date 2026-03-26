import type { Octokit } from "@octokit/rest";
import type { FileChange, PRContext } from "../config/types.js";
import { parseDiff } from "./diff-parser.js";

export async function fetchPRContext(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  excludePatterns: string[],
): Promise<PRContext> {
  // Fetch PR metadata and diff in parallel
  const [prData, diffData, filesData] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: prNumber }),
    octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    }),
    octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 300,
    }),
  ]);

  const pr = prData.data;
  const rawDiff = diffData.data as unknown as string;

  const files: FileChange[] = filesData.data.map((f) => ({
    filename: f.filename,
    status: f.status as FileChange["status"],
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch,
  }));

  // Filter excluded patterns
  const filteredFiles = files.filter(
    (f) => !excludePatterns.some((p) => matchGlob(f.filename, p)),
  );

  const parsedDiff = parseDiff(rawDiff).filter(
    (f) => !excludePatterns.some((p) => matchGlob(f.filename, p)),
  );

  const additions = filteredFiles.reduce((sum, f) => sum + f.additions, 0);
  const deletions = filteredFiles.reduce((sum, f) => sum + f.deletions, 0);

  return {
    number: prNumber,
    title: pr.title,
    body: pr.body ?? "",
    author: pr.user?.login ?? "unknown",
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    files: filteredFiles,
    parsedDiff,
    additions,
    deletions,
    changedFiles: filteredFiles.length,
  };
}

/** Simple glob matcher supporting * and ** */
function matchGlob(filename: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{DOUBLESTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLESTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`).test(filename);
}
