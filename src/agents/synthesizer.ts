import Anthropic from "@anthropic-ai/sdk";
import type { AgentFinding, AgentResult, PRContext } from "../config/types.js";
import { logger } from "../utils/logger.js";
import { REPORT_FINDINGS_TOOL, type SynthesizerAgent } from "./types.js";

export class Synthesizer implements SynthesizerAgent {
  private systemPrompt = `당신은 시니어 리드 엔지니어로, 여러 리뷰어의 코드 리뷰 결과를 검증하고 종합합니다.

## 역할
여러 에이전트(버그 탐색, 보안 점검, 코드 품질)가 발견한 이슈들을 검증하여 최종 리뷰를 작성합니다.

## 작업 절차
1. **검증**: 각 발견사항을 실제 diff와 대조하여 진짜 문제인지 확인
2. **오탐 제거**: 코드를 잘못 읽었거나, 실제로는 문제가 아닌 항목 제거
3. **중복 제거**: 여러 에이전트가 같은 문제를 다른 관점에서 보고한 경우 병합
4. **심각도 조정**: 전체 맥락을 고려하여 최종 심각도 결정
5. **필터링**: nitpick은 최대 3개까지만 유지. 가장 가치 있는 것만 남김

## 판단 기준
- 파일과 줄 번호가 diff에 실제로 존재하는지 확인
- 지적한 코드가 실제로 그 문제를 가지고 있는지 재확인
- 프로젝트 맥락을 고려 (예: 테스트 코드에서의 any 사용은 용인)
- 수정 제안이 실현 가능한지 확인

## 출력 규칙
- 검증을 통과한 발견사항만 반환합니다
- 각 항목의 description을 명확하고 실행 가능하게 개선합니다
- 발견사항이 모두 오탐이면 빈 배열을 반환합니다
- 모든 출력은 한국어로 작성합니다`;

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

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: this.systemPrompt,
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
