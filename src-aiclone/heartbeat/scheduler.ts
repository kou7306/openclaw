import type { DatabaseSync } from "node:sqlite";
import type { EmbedFn } from "../memory/recall.js";
import { observe, type ObservationInput } from "./observe.js";
import { shouldUtter } from "./throttle.js";
import { generateUtterance, type UtteranceGenerator } from "./utterance.js";

export type HeartBeatConfig = {
  enabled: boolean;
  intervalSeconds: number;
};

export const DEFAULT_HEARTBEAT_CONFIG: HeartBeatConfig = {
  enabled: true,
  intervalSeconds: 45 * 60,
};

export type HeartBeatDeps = {
  db: DatabaseSync;
  embed: EmbedFn;
  aicloneHome: string;
  generator: UtteranceGenerator;
  onUtterance: (utterance: {
    text: string;
    themes: string[];
    generatedAt: number;
  }) => void | Promise<void>;
};

export function startHeartBeat(
  deps: HeartBeatDeps,
  config: HeartBeatConfig = DEFAULT_HEARTBEAT_CONFIG,
): () => void {
  if (!config.enabled) {
    return () => {};
  }
  const intervalMs = config.intervalSeconds * 1000;
  const timer = setInterval(() => {
    void runHeartBeatTick(deps);
  }, intervalMs);
  return () => clearInterval(timer);
}

export async function runHeartBeatTick(deps: HeartBeatDeps): Promise<void> {
  const obs: ObservationInput = await observe(deps.db, deps.aicloneHome);
  const gate = shouldUtter(deps.db, obs);
  if (!gate.allowed) {
    return;
  }

  const utterance = await generateUtterance(deps.generator, obs);
  if (!utterance) {
    return;
  }

  await deps.onUtterance({
    text: utterance.text,
    themes: utterance.themes,
    generatedAt: Date.now(),
  });
}
