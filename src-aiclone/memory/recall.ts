import { recallDeep } from "./recall-deep.js";
import { recallFast, type RecallFastDeps } from "./recall-fast.js";
import type { RecallMode, RecallParams, RecallResult } from "./types.js";

export type RouteRecallDeps = RecallFastDeps & {
  classifyMode?: (params: { query: string; mode?: RecallMode }) => "fast" | "deep";
};

export async function routeRecall(
  deps: RouteRecallDeps,
  params: RecallParams,
): Promise<RecallResult> {
  const decided = decideMode(deps, params);
  if (decided === "deep") {
    return recallDeep(deps, params);
  }
  return recallFast(deps, params);
}

function decideMode(deps: RouteRecallDeps, params: RecallParams): "fast" | "deep" {
  const requested = params.mode ?? "auto";
  if (requested === "fast" || requested === "deep") return requested;
  if (deps.classifyMode) return deps.classifyMode({ query: params.query, mode: requested });
  return "fast";
}

export type { EmbedFn, DomainThemeSelector, RecallFastDeps } from "./recall-fast.js";
