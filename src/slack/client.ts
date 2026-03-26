import type { PRContext, ReviewResult } from "../config/types.js";
import { logger } from "../utils/logger.js";

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "\u{1F6A8}",
  warning: "\u26A0\uFE0F",
  info: "\u{1F4A1}",
  nitpick: "\u{1F4DD}",
};

export async function sendSlackNotification(
  webhookUrl: string,
  prContext: PRContext,
  result: ReviewResult,
  repoOwner: string,
  repoName: string,
): Promise<void> {
  const prUrl = `https://github.com/${repoOwner}/${repoName}/pull/${prContext.number}`;
  const { findings, mode, totalDurationMs } = result;

  const bySeverity = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
    nitpick: findings.filter((f) => f.severity === "nitpick").length,
  };

  const hasCritical = bySeverity.critical > 0;
  const color = hasCritical ? "#dc2626" : findings.length > 0 ? "#f59e0b" : "#22c55e";

  const severitySummary = [
    bySeverity.critical > 0 ? `${SEVERITY_EMOJI["critical"]} Critical: ${bySeverity.critical}` : "",
    bySeverity.warning > 0 ? `${SEVERITY_EMOJI["warning"]} Warning: ${bySeverity.warning}` : "",
    bySeverity.info > 0 ? `${SEVERITY_EMOJI["info"]} Info: ${bySeverity.info}` : "",
    bySeverity.nitpick > 0 ? `${SEVERITY_EMOJI["nitpick"]} Nitpick: ${bySeverity.nitpick}` : "",
  ]
    .filter(Boolean)
    .join("  |  ");

  // Top critical findings for Slack
  const criticalItems = findings
    .filter((f) => f.severity === "critical")
    .slice(0, 3)
    .map((f) => `\u2022 \`${f.file}:${f.line}\` ${f.title}`)
    .join("\n");

  const durationSec = (totalDurationMs / 1000).toFixed(0);

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*\u{1F50D} Senior Reviewer \u2014 \uCF54\uB4DC \uB9AC\uBDF0 \uC644\uB8CC*`,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*PR:* <${prUrl}|#${prContext.number} ${prContext.title}>` },
        { type: "mrkdwn", text: `*\uC791\uC131\uC790:* ${prContext.author}` },
        { type: "mrkdwn", text: `*\uBAA8\uB4DC:* ${mode}` },
        { type: "mrkdwn", text: `*\uC18C\uC694\uC2DC\uAC04:* ${durationSec}\uCD08` },
      ],
    },
  ];

  if (findings.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "\u2705 \uBC1C\uACAC\uC0AC\uD56D \uC5C6\uC74C \u2014 \uD074\uB9B0 PR\uC785\uB2C8\uB2E4!" },
      fields: [],
    });
  } else {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*\uBC1C\uACAC\uC0AC\uD56D:* ${findings.length}\uAC1C\n${severitySummary}` },
      fields: [],
    });

    if (criticalItems) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${SEVERITY_EMOJI["critical"]} \uD06C\uB9AC\uD2F0\uCEEC \uC774\uC288:*\n${criticalItems}`,
        },
        fields: [],
      });
    }
  }

  const payload = {
    attachments: [
      {
        color,
        blocks,
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    logger.error("Slack \uC54C\uB9BC \uC804\uC1A1 \uC2E4\uD328", {
      status: response.status,
      body: await response.text(),
    });
  } else {
    logger.info("Slack \uC54C\uB9BC \uC804\uC1A1 \uC644\uB8CC");
  }
}
