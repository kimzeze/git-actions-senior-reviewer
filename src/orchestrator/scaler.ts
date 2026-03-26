import type { PRContext, ReviewMode } from "../config/types.js";
import { logger } from "../utils/logger.js";

interface ScaleDecision {
  mode: ReviewMode;
  agentModel: string;
  synthesizerModel: string;
}

export function determineReviewScale(
  context: PRContext,
  modelOverride: string,
): ScaleDecision {
  const totalChanges = context.additions + context.deletions;

  let mode: ReviewMode;

  if (totalChanges <= 50 && context.changedFiles <= 3) {
    mode = "lightweight";
  } else if (totalChanges <= 500 && context.changedFiles <= 20) {
    mode = "standard";
  } else {
    mode = "full";
  }

  const decision: ScaleDecision = {
    mode,
    agentModel:
      modelOverride !== "auto" ? modelOverride : "claude-sonnet-4-6",
    synthesizerModel:
      modelOverride !== "auto"
        ? modelOverride
        : mode === "full"
          ? "claude-sonnet-4-6"
          : "claude-sonnet-4-6",
  };

  logger.info("리뷰 스케일 결정", {
    mode,
    totalChanges,
    changedFiles: context.changedFiles,
    agentModel: decision.agentModel,
    synthesizerModel: decision.synthesizerModel,
  });

  return decision;
}
