import { loadConfig } from "./config/index.js";
import type { PromptContext } from "./agents/base-agent.js";
import { getOctokit } from "./github/client.js";
import { fetchPRContext } from "./github/pr-context.js";
import { postReview } from "./github/review-poster.js";
import { orchestrateReview } from "./orchestrator/index.js";
import { sendSlackNotification } from "./slack/client.js";
import { logger } from "./utils/logger.js";

async function main() {
  logger.info("Senior Reviewer 시작");

  // Load configuration
  const config = loadConfig();
  logger.info("설정 로드 완료", {
    repo: `${config.repoOwner}/${config.repoName}`,
    pr: config.prNumber,
    service: config.serviceName,
    modelOverride: config.reviewModel,
    team: config.team ?? "(없음)",
    stacks: config.stacks.length > 0 ? config.stacks.join(", ") : "(없음)",
  });

  // Initialize GitHub client
  const octokit = getOctokit(config.githubToken);

  // Fetch PR context
  logger.info("PR 정보 가져오는 중...");
  const prContext = await fetchPRContext(
    octokit,
    config.repoOwner,
    config.repoName,
    config.prNumber,
    config.excludePatterns,
  );

  logger.info("PR 정보 로드 완료", {
    title: prContext.title,
    author: prContext.author,
    additions: prContext.additions,
    deletions: prContext.deletions,
    changedFiles: prContext.changedFiles,
  });

  // Skip review for empty diffs
  if (prContext.parsedDiff.length === 0) {
    logger.info("리뷰할 변경 사항이 없습니다. 종료합니다.");
    return;
  }

  // Build prompt context
  const promptContext: PromptContext = {
    team: config.team,
    stacks: config.stacks,
  };

  // Run multi-agent review
  const result = await orchestrateReview(prContext, config.reviewModel, promptContext);

  // Post review to GitHub PR
  logger.info("리뷰 결과를 PR에 게시하는 중...");
  await postReview(
    octokit,
    config.repoOwner,
    config.repoName,
    prContext,
    result,
  );

  // Send Slack notification
  if (config.slackWebhookUrl) {
    logger.info("Slack 알림 전송 중...");
    await sendSlackNotification(
      config.slackWebhookUrl,
      prContext,
      result,
      config.repoOwner,
      config.repoName,
    );
  }

  // Summary output
  logger.info("=== 리뷰 완료 ===", {
    mode: result.mode,
    totalFindings: result.findings.length,
    critical: result.findings.filter((f) => f.severity === "critical").length,
    warning: result.findings.filter((f) => f.severity === "warning").length,
    totalTokens:
      result.totalTokenUsage.input + result.totalTokenUsage.output,
    durationSec: (result.totalDurationMs / 1000).toFixed(1),
  });
}

main().catch((error) => {
  logger.error("Senior Reviewer 실행 실패", { error: String(error) });
  process.exit(1);
});
