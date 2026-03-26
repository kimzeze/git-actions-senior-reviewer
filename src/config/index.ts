import { ReviewConfigSchema, type ReviewConfig } from "./types.js";

export function loadConfig(): ReviewConfig {
  const excludeRaw = process.env["EXCLUDE_PATTERNS"] ?? "";

  return ReviewConfigSchema.parse({
    anthropicApiKey: process.env["ANTHROPIC_API_KEY"],
    githubToken: process.env["GITHUB_TOKEN"],
    prNumber: Number(process.env["PR_NUMBER"]),
    repoOwner: process.env["REPO_OWNER"],
    repoName: process.env["REPO_NAME"],
    serviceName: process.env["SERVICE_NAME"] ?? "default",
    reviewModel: process.env["REVIEW_MODEL"] ?? "auto",
    excludePatterns: excludeRaw
      ? excludeRaw.split(",").map((p) => p.trim())
      : [],
    slackWebhookUrl: process.env["SLACK_WEBHOOK_URL"] || undefined,
    targetRepoPath: process.env["TARGET_REPO_PATH"] || undefined,
  });
}

export * from "./types.js";
