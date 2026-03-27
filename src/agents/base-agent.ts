import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentFinding,
  AgentResult,
  DiffHunk,
  PRContext,
} from "../config/types.js";
import { logger } from "../utils/logger.js";
import { REPORT_FINDINGS_TOOL, type ReviewAgent } from "./types.js";

const PROMPTS_DIR = path.resolve(process.cwd(), "prompts");

let anthropicClient: Anthropic | null = null;

function getClient(apiKey: string): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export interface PromptContext {
  team?: string;
  stacks: string[];
}

/**
 * prompts/ 디렉토리에서 md 파일을 읽어 반환한다.
 * 파일이 없으면 null을 반환한다.
 */
function loadPromptFile(relativePath: string): string | null {
  const fullPath = path.join(PROMPTS_DIR, relativePath);
  try {
    return fs.readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * 에이전트 이름 + team + stacks 기반으로 시스템 프롬프트를 합성한다.
 *
 * 합성 순서:
 * 1. agents/{agentName}.md (필수)
 * 2. teams/{team}.md (선택)
 * 3. stacks/{stack}.md × N (선택)
 */
export function buildSystemPrompt(
  agentName: string,
  promptContext: PromptContext,
): string {
  const parts: string[] = [];

  // 1. Agent 기본 프롬프트 (필수)
  const agentPrompt = loadPromptFile(`agents/${agentName}.md`);
  if (!agentPrompt) {
    throw new Error(
      `에이전트 프롬프트 파일을 찾을 수 없습니다: prompts/agents/${agentName}.md`,
    );
  }
  parts.push(agentPrompt);

  // 2. Team 프롬프트 (선택)
  if (promptContext.team) {
    const teamPrompt = loadPromptFile(`teams/${promptContext.team}.md`);
    if (teamPrompt) {
      parts.push(teamPrompt);
    } else {
      logger.warn(
        `팀 프롬프트 파일을 찾을 수 없습니다: prompts/teams/${promptContext.team}.md — 해당 프롬프트 없이 진행합니다.`,
      );
    }
  }

  // 3. Stack 프롬프트 (선택, 복수)
  for (const stack of promptContext.stacks) {
    const stackPrompt = loadPromptFile(`stacks/${stack}.md`);
    if (stackPrompt) {
      parts.push(stackPrompt);
    } else {
      logger.warn(
        `스택 프롬프트 파일을 찾을 수 없습니다: prompts/stacks/${stack}.md — 해당 프롬프트 없이 진행합니다.`,
      );
    }
  }

  return parts.join("\n\n---\n\n");
}

export abstract class BaseAgent implements ReviewAgent {
  abstract name: string;
  private promptContext: PromptContext;

  constructor(promptContext: PromptContext = { stacks: [] }) {
    this.promptContext = promptContext;
  }

  protected getSystemPrompt(): string {
    return buildSystemPrompt(this.name, this.promptContext);
  }

  protected buildUserPrompt(context: PRContext): string {
    const fileList = context.files
      .map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions})`)
      .join("\n");

    const diffContent = context.parsedDiff
      .map((f) => {
        const hunks = f.hunks
          .map((h) => annotateHunkWithLineNumbers(h))
          .join("\n");
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

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      system: systemPrompt,
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

/**
 * diff 각 줄에 새 파일 기준 줄 번호를 붙여서 AI의 줄 번호 보고 정확도를 높인다.
 *
 *   @@ -10,5 +10,7 @@
 *    10:  const a = 1
 *    11:  const b = 2
 *    12: +const c = 3
 *        -const old = 'removed'
 */
function annotateHunkWithLineNumbers(hunk: DiffHunk): string {
  const lines = hunk.content.split("\n");
  const annotated: string[] = [];
  let newLineNum = hunk.newStart;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      annotated.push(line);
    } else if (line.startsWith("-")) {
      // 삭제된 줄은 새 파일에 없으므로 줄 번호 없이 표시
      annotated.push(`     ${line}`);
    } else {
      // 추가된 줄(+) 또는 context 줄( )
      annotated.push(`${String(newLineNum).padStart(4)}: ${line}`);
      newLineNum++;
    }
  }

  return annotated.join("\n");
}
