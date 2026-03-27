import type {
  AgentFinding,
  AgentResult,
  PRContext,
  ReviewResult,
} from "../config/types.js";
import type { PromptContext } from "../agents/base-agent.js";
import { BugDetectorAgent } from "../agents/bug-detector.js";
import { SecurityCheckerAgent } from "../agents/security-checker.js";
import { CodeQualityAgent } from "../agents/code-quality.js";
import { Synthesizer } from "../agents/synthesizer.js";
import { logger } from "../utils/logger.js";
import { determineReviewScale } from "./scaler.js";

export async function orchestrateReview(
  context: PRContext,
  modelOverride: string,
  promptContext: PromptContext,
): Promise<ReviewResult> {
  const startTime = Date.now();
  const scale = determineReviewScale(context, modelOverride);

  logger.info("리뷰 오케스트레이션 시작", {
    mode: scale.mode,
    pr: context.number,
    title: context.title,
    team: promptContext.team ?? "(없음)",
    stacks: promptContext.stacks.length > 0 ? promptContext.stacks.join(", ") : "(없음)",
  });

  let agentResults: AgentResult[];

  if (scale.mode === "lightweight") {
    // Lightweight: 버그 탐색 에이전트 하나만 실행
    const bugAgent = new BugDetectorAgent(promptContext);
    const result = await bugAgent.review(context, scale.agentModel);
    agentResults = [result];
  } else {
    // Standard/Full: 3개 에이전트 병렬 실행
    const agents = [
      new BugDetectorAgent(promptContext),
      new SecurityCheckerAgent(promptContext),
      new CodeQualityAgent(promptContext),
    ];

    const results = await Promise.allSettled(
      agents.map((agent) => agent.review(context, scale.agentModel)),
    );

    agentResults = results
      .map((r, i) => {
        if (r.status === "fulfilled") return r.value;
        logger.error(`에이전트 실패: ${agents[i]!.name}`, {
          error: String(r.reason),
        });
        return null;
      })
      .filter((r): r is AgentResult => r !== null);
  }

  // Collect all findings
  const allFindings: AgentFinding[] = agentResults.flatMap(
    (r) => r.findings,
  );

  logger.info("에이전트 실행 완료", {
    totalFindings: allFindings.length,
    byAgent: agentResults.map((r) => ({
      name: r.agentName,
      findings: r.findings.length,
    })),
  });

  // Synthesizer: 검증 및 필터링 (lightweight 모드에서도 발견사항이 있으면 실행)
  let finalFindings: AgentFinding[];

  if (allFindings.length > 0 && scale.mode !== "lightweight") {
    const synthesizer = new Synthesizer(promptContext);
    const synthResult = await synthesizer.synthesize(
      allFindings,
      context,
      scale.synthesizerModel,
    );
    agentResults.push(synthResult);
    finalFindings = synthResult.findings;
  } else {
    finalFindings = allFindings;
  }

  // Sort by severity
  const severityOrder = { critical: 0, warning: 1, info: 2, nitpick: 3 };
  finalFindings.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );

  const totalTokenUsage = agentResults.reduce(
    (acc, r) => ({
      input: acc.input + r.tokenUsage.input,
      output: acc.output + r.tokenUsage.output,
    }),
    { input: 0, output: 0 },
  );

  const result: ReviewResult = {
    mode: scale.mode,
    findings: finalFindings,
    agentResults,
    totalTokenUsage,
    totalDurationMs: Date.now() - startTime,
  };

  logger.info("리뷰 오케스트레이션 완료", {
    mode: result.mode,
    totalFindings: result.findings.length,
    totalTokens: result.totalTokenUsage,
    totalDurationMs: result.totalDurationMs,
  });

  return result;
}
