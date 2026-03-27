import type { Octokit } from "@octokit/rest";
import type { AgentFinding, PRContext, ReviewResult } from "../config/types.js";
import { logger } from "../utils/logger.js";

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "\u{1F6A8}",
  warning: "\u26A0\uFE0F",
  info: "\u{1F4A1}",
  nitpick: "\u{1F4DD}",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  info: "INFO",
  nitpick: "NITPICK",
};

const CATEGORY_LABEL: Record<string, string> = {
  bug: "\uBC84\uADF8",
  security: "\uBCF4\uC548",
  quality: "\uD488\uC9C8",
};

export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  prContext: PRContext,
  result: ReviewResult,
): Promise<void> {
  const { findings } = result;
  const summaryBody = buildSummaryComment(result, prContext);

  if (findings.length === 0) {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prContext.number,
      body: summaryBody,
    });
    logger.info("클린 리뷰 코멘트 작성 완료");
    return;
  }

  // 1. findings를 검증하여 인라인 가능/불가능으로 분류
  const { valid: inlineFindings, invalid: textOnlyFindings } =
    validateFindings(findings, prContext);

  if (textOnlyFindings.length > 0) {
    logger.warn("인라인 불가 findings (diff 범위 밖 또는 유효하지 않은 줄 번호)", {
      count: textOnlyFindings.length,
      details: textOnlyFindings.map((f) => ({ file: f.file, line: f.line })),
    });
  }

  // 2. 인라인 코멘트 시도 (batch — 알림 1개)
  let inlineSuccess = false;
  if (inlineFindings.length > 0) {
    const inlineComments = inlineFindings.slice(0, 50).map((f) => ({
      path: f.file,
      line: f.line,
      body: formatInlineComment(f),
    }));

    try {
      await octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: prContext.number,
        event: "COMMENT",
        comments: inlineComments,
      });
      inlineSuccess = true;
      logger.info("인라인 리뷰 코멘트 작성 완료", {
        count: inlineComments.length,
      });
    } catch (error) {
      logger.warn("인라인 리뷰 실패, 요약 코멘트에 포함", {
        error: String(error),
      });
    }
  }

  // 3. 요약 코멘트 게시 (항상 1회)
  //    - 인라인 성공 시: 요약 + 인라인 불가 findings만
  //    - 인라인 실패 시: 요약 + 모든 findings
  const textFindings = inlineSuccess ? textOnlyFindings : findings;
  const body =
    textFindings.length > 0
      ? summaryBody + "\n\n" + formatAllFindingsAsText(textFindings)
      : summaryBody;

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prContext.number,
    body,
  });

  logger.info("요약 코멘트 작성 완료", {
    inlineSuccess,
    inlineCount: inlineFindings.length,
    textCount: textFindings.length,
  });
}

/**
 * findings를 검증하여 인라인 가능(valid) / 불가능(invalid)으로 분류한다.
 * - file이 diff에 존재하는지
 * - line이 양의 정수인지
 * - line이 hunk 범위 안에 있는지
 */
function validateFindings(
  findings: AgentFinding[],
  context: PRContext,
): { valid: AgentFinding[]; invalid: AgentFinding[] } {
  const valid: AgentFinding[] = [];
  const invalid: AgentFinding[] = [];

  for (const finding of findings) {
    if (!Number.isInteger(finding.line) || finding.line < 1) {
      invalid.push(finding);
      continue;
    }

    const file = context.parsedDiff.find((f) => f.filename === finding.file);
    if (!file) {
      invalid.push(finding);
      continue;
    }

    const inHunk = file.hunks.some(
      (h) =>
        finding.line >= h.newStart &&
        finding.line < h.newStart + h.newLines,
    );

    if (inHunk) {
      valid.push(finding);
    } else {
      invalid.push(finding);
    }
  }

  return { valid, invalid };
}

function formatInlineComment(finding: AgentFinding): string {
  const emoji = SEVERITY_EMOJI[finding.severity] ?? "";
  const label = SEVERITY_LABEL[finding.severity] ?? "";
  const category = CATEGORY_LABEL[finding.category] ?? "";

  let body = `${emoji} **[${label}] ${finding.title}** (${category})\n\n${finding.description}`;

  if (finding.suggestion) {
    body += `\n\n**\uC218\uC815 \uC81C\uC548:**\n\`\`\`suggestion\n${finding.suggestion}\n\`\`\``;
  }

  return body;
}

function buildSummaryComment(
  result: ReviewResult,
  context: PRContext,
): string {
  const { findings, mode, totalTokenUsage, totalDurationMs, agentResults } =
    result;

  const bySeverity = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
    nitpick: findings.filter((f) => f.severity === "nitpick").length,
  };

  const durationSec = (totalDurationMs / 1000).toFixed(1);
  const totalTokens = totalTokenUsage.input + totalTokenUsage.output;
  const estimatedCost = (
    (totalTokenUsage.input * 0.003 + totalTokenUsage.output * 0.015) /
    1000
  ).toFixed(2);

  let body = `## \u{1F50D} Senior Reviewer \u2014 \uCF54\uB4DC \uB9AC\uBDF0 \uACB0\uACFC\n\n`;
  body += `| \uD56D\uBAA9 | \uAC12 |\n|------|------|\n`;
  body += `| PR | #${context.number} ${context.title} |\n`;
  body += `| \uB9AC\uBDF0 \uBAA8\uB4DC | ${mode} |\n`;
  body += `| \uBCC0\uACBD \uADDC\uBAA8 | +${context.additions}/-${context.deletions} (${context.changedFiles}\uAC1C \uD30C\uC77C) |\n`;
  body += `| \uC18C\uC694 \uC2DC\uAC04 | ${durationSec}\uCD08 |\n`;
  body += `| \uD1A0\uD070 \uC0AC\uC6A9\uB7C9 | ${totalTokens.toLocaleString()} (~$${estimatedCost}) |\n\n`;

  if (findings.length === 0) {
    body += `### \u2705 \uBC1C\uACAC\uC0AC\uD56D \uC5C6\uC74C\n\n`;
    body += `\uCF54\uB4DC \uB9AC\uBDF0 \uACB0\uACFC \uD2B9\uBCC4\uD55C \uBB38\uC81C\uAC00 \uBC1C\uACAC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uD83D\uDE4C\n`;
  } else {
    body += `### \uBC1C\uACAC\uC0AC\uD56D \uC694\uC57D\n\n`;
    body += `| \uC2EC\uAC01\uB3C4 | \uAC74\uC218 |\n|--------|------|\n`;
    if (bySeverity.critical > 0)
      body += `| ${SEVERITY_EMOJI["critical"]} Critical | ${bySeverity.critical} |\n`;
    if (bySeverity.warning > 0)
      body += `| ${SEVERITY_EMOJI["warning"]} Warning | ${bySeverity.warning} |\n`;
    if (bySeverity.info > 0)
      body += `| ${SEVERITY_EMOJI["info"]} Info | ${bySeverity.info} |\n`;
    if (bySeverity.nitpick > 0)
      body += `| ${SEVERITY_EMOJI["nitpick"]} Nitpick | ${bySeverity.nitpick} |\n`;
    body += `\n`;

    if (bySeverity.critical > 0) {
      body += `> \u{1F6A8} **${bySeverity.critical}\uAC1C\uC758 \uD06C\uB9AC\uD2F0\uCEEC \uC774\uC288\uAC00 \uC788\uC2B5\uB2C8\uB2E4. \uBA38\uC9C0 \uC804 \uBC18\uB4DC\uC2DC \uD655\uC778\uD574\uC8FC\uC138\uC694.**\n\n`;
    }
  }

  // Agent execution summary
  body += `<details>\n<summary>\uC5D0\uC774\uC804\uD2B8 \uC2E4\uD589 \uC0C1\uC138</summary>\n\n`;
  body += `| \uC5D0\uC774\uC804\uD2B8 | \uBC1C\uACAC | \uC18C\uC694\uC2DC\uAC04 | \uD1A0\uD070 |\n|---------|------|----------|------|\n`;
  for (const agent of agentResults) {
    const sec = (agent.durationMs / 1000).toFixed(1);
    const tokens = agent.tokenUsage.input + agent.tokenUsage.output;
    body += `| ${agent.agentName} | ${agent.findings.length} | ${sec}\uCD08 | ${tokens.toLocaleString()} |\n`;
  }
  body += `\n</details>\n\n`;
  body += `---\n*Powered by [Senior Reviewer](https://github.com/aptimizer-co/senior-reviewer) \u{1F916}*`;

  return body;
}

function formatAllFindingsAsText(findings: AgentFinding[]): string {
  if (findings.length === 0) return "";

  return findings
    .map((f) => {
      const emoji = SEVERITY_EMOJI[f.severity] ?? "";
      const label = SEVERITY_LABEL[f.severity] ?? "";
      const category = CATEGORY_LABEL[f.category] ?? "";
      let text = `### ${emoji} [${label}] ${f.title} (${category})\n`;
      text += `**\uD30C\uC77C:** \`${f.file}:${f.line}\`\n\n`;
      text += `${f.description}\n`;
      if (f.suggestion) {
        text += `\n**\uC218\uC815 \uC81C\uC548:**\n\`\`\`\n${f.suggestion}\n\`\`\`\n`;
      }
      return text;
    })
    .join("\n---\n\n");
}
