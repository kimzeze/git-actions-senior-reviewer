import Anthropic from "@anthropic-ai/sdk";
import type { AgentFinding, AgentResult, PRContext } from "../config/types.js";
import { logger } from "../utils/logger.js";
import { REPORT_FINDINGS_TOOL, type ReviewAgent } from "./types.js";

let anthropicClient: Anthropic | null = null;

function getClient(apiKey: string): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export abstract class BaseAgent implements ReviewAgent {
  abstract name: string;
  protected abstract systemPrompt: string;

  protected buildUserPrompt(context: PRContext): string {
    const fileList = context.files
      .map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`)
      .join("\n");

    const diffContent = context.parsedDiff
      .map((f) => {
        const hunks = f.hunks.map((h) => h.content).join("\n");
        return `### ${f.filename}\n\`\`\`diff\n${hunks}\n\`\`\``;
      })
      .join("\n\n");

    return `## PR 정보
- 제목: ${context.title}
- 작성자: ${context.author}
- 브랜치: ${context.headBranch} → ${context.baseBranch}
- 변경: +${context.additions}/-${context.deletions} (${context.changedFiles}개 파일)

## 변경된 파일 목록
${fileList}

## PR 설명
${context.body || "(없음)"}

## 변경 사항 (Diff)
${diffContent}`;
  }

  async review(context: PRContext, model: string): Promise<AgentResult> {
    const startTime = Date.now();
    const apiKey = process.env["ANTHROPIC_API_KEY"]!;
    const client = getClient(apiKey);

    logger.info(`[${this.name}] 리뷰 시작`, { model, files: context.changedFiles });

    const userPrompt = this.buildUserPrompt(context);

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: this.systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [REPORT_FINDINGS_TOOL],
      tool_choice: { type: "tool", name: "report_findings" },
    });

    // Extract findings from tool use response
    const toolBlock = response.content.find((b) => b.type === "tool_use");
    const findings: AgentFinding[] = [];

    if (toolBlock && toolBlock.type === "tool_use") {
      const input = toolBlock.input as { findings: AgentFinding[] };
      findings.push(...(input.findings ?? []));
    }

    const durationMs = Date.now() - startTime;
    const tokenUsage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };

    logger.info(`[${this.name}] 리뷰 완료`, {
      findings: findings.length,
      durationMs,
      tokens: tokenUsage,
    });

    return {
      agentName: this.name,
      findings,
      tokenUsage,
      durationMs,
    };
  }
}
