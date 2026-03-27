import type { AgentFinding, AgentResult, PRContext } from "../config/types.js";

export interface ReviewAgent {
  name: string;
  review(context: PRContext, model: string): Promise<AgentResult>;
}

export interface SynthesizerAgent {
  synthesize(
    findings: AgentFinding[],
    context: PRContext,
    model: string,
  ): Promise<AgentResult>;
}

/** Tool schema for structured output from Claude */
export const REPORT_FINDINGS_TOOL = {
  name: "report_findings" as const,
  description:
    "코드 리뷰 결과를 구조화된 형식으로 보고합니다. 발견사항이 없으면 빈 배열을 반환하세요.",
  input_schema: {
    type: "object" as const,
    properties: {
      findings: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            file: {
              type: "string" as const,
              description: "파일 경로 (diff에 나타난 그대로)",
            },
            line: {
              type: "number" as const,
              description:
                "새 버전(new file) 기준 줄 번호. diff 왼쪽에 표기된 줄 번호를 그대로 사용하세요.",
            },
            endLine: {
              type: "number" as const,
              description: "범위의 끝 줄 번호 (선택)",
            },
            severity: {
              type: "string" as const,
              enum: ["critical", "warning", "info", "nitpick"],
              description:
                "심각도: critical=반드시수정, warning=권장수정, info=참고, nitpick=사소한개선",
            },
            category: {
              type: "string" as const,
              enum: ["bug", "security", "quality"],
            },
            title: {
              type: "string" as const,
              description: "한국어 제목 (간결하게)",
            },
            description: {
              type: "string" as const,
              description: "한국어 상세 설명",
            },
            suggestion: {
              type: "string" as const,
              description: "수정 제안 코드 (선택)",
            },
          },
          required: [
            "file",
            "line",
            "severity",
            "category",
            "title",
            "description",
          ],
        },
      },
    },
    required: ["findings"],
  },
} as const;
