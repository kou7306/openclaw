import type { RecallParams, RecallResult } from "./types.js";
import { recallFast, type RecallFastDeps } from "./recall-fast.js";

/**
 * Deep Mode entry point.
 *
 * MVP: delegate to Fast Mode and stamp `mode_executed: "deep"` for ログ。
 * Phase 3 で Planner + サブエージェントの RLM 実装に差し替える（[ADR-0005]）。
 */
export async function recallDeep(
  deps: RecallFastDeps,
  params: RecallParams,
): Promise<RecallResult> {
  const fastResult = await recallFast(deps, params);
  return {
    ...fastResult,
    meta: {
      ...fastResult.meta,
      mode_executed: "deep",
    },
  };
}
