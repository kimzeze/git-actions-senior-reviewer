import Anthropic from "@anthropic-ai/sdk";
import type { AgentFinding, AgentResult, PRContext } from "../config/types.js";
import { logger } from "../utils/logger.js";
import { REPORT_FINDINGS_TOOL, type SynthesizerAgent } from "./types.js";
import { buildSystemPrompt, type PromptContext } from "./base-agent.js";

export class Synthesizer implements SynthesizerAgent {
  private promptContext: PromptContext;

  constructor(promptContext: PromptContext = { stacks: [] }) {
    this.promptContext = promptContext;
  }

  private getSystemPrompt(): string {
    return buildSystemPrompt("synthesizer", this.promptContext);
  }

  async synthesize(
    findings: AgentFinding[],
    context: PRContext,
    model: string,
  ): Promise<AgentResult> {
    const startTime = Date.now();

    if (findings.length === 0) {
      logger.info("[synthesizer] 검증할 발견사항 없음");
      return {
        agentName: "synthesizer",
        findings: [],
        tokenUsage: { input: 0, output: 0 },
        durationMs: Date.now() - startTime,
      };
    }

    const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"]! });

    const diffContent = context.parsedDiff
      .map((f) => {
        const hunks = f.hunks.map((h) => h.content).join("\n");
        return `### ${f.filename}\n\`\`\`diff\n${hunks}\n\`\`\``;
      })
      .join("\n\n");

    const findingsText = findings
      .map(
        (f, i) =>
          `### 발견 #${i + 1} [${f.severity}/${f.category}]
- 파일: ${f.file}:${f.line}
- 제목: ${f.title}
- 설명: ${f.description}
${f.suggestion ? `- 수정 제안:\n\`\`\`\n${f.suggestion}\n\`\`\`` : ""}`,
      )
      .join("\n\n");

    const userPrompt = `## 검증 대상: ${findings.length}개 발견사항

${findingsText}

---

## 원본 Diff
${diffContent}

---

위 발견사항들을 원본 diff와 대조하여 검증하세요. 오탐을 제거하고, 중복을 병합하고, 최종 심각도를 결정하세요.`;

    logger.info("[synthesizer] 검증 시작", {
      model,
      inputFindings: findings.length,
    });

    const systemPrompt = this.getSystemPrompt();

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [REPORT_FINDINGS_TOOL],
      tool_choice: { type: "tool", name: "report_findings" },
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    const verified: AgentFinding[] = [];

    if (toolBlock && toolBlock.type === "tool_use") {
      const input = toolBlock.input as { findings: AgentFinding[] };
      verified.push(...(input.findings ?? []));
    }

    const durationMs = Date.now() - startTime;
    const tokenUsage = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };

    logger.info("[synthesizer] 검증 완료", {
      inputFindings: findings.length,
      verifiedFindings: verified.length,
      removed: findings.length - verified.length,
      durationMs,
    });

    return {
      agentName: "synthesizer",
      findings: verified,
      tokenUsage,
      durationMs,
    };
  }
}
