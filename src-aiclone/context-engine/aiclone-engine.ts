import type { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type {
  AssembleResult,
  BootstrapResult,
  CompactResult,
  ContextEngine,
  ContextEngineInfo,
  IngestResult,
} from "../../src/context-engine/types.js";
import {
  getContextBlocks,
  getRecentShortMemories,
  getRelatedShortMemories,
  logAccess,
  recall,
  type EmbedFn,
  type RecallParams,
} from "../memory/index.js";
import { buildSystemPromptAddition, buildToolDeclarations } from "./assemble.js";

export type AiCloneEngineDeps = {
  db: DatabaseSync;
  embed: EmbedFn;
  aicloneHome: string;
};

export class AiCloneEngine implements ContextEngine {
  readonly info: ContextEngineInfo = {
    id: "aiclone",
    name: "AI Clone Context Engine",
    version: "0.1.0",
  };

  constructor(private readonly deps: AiCloneEngineDeps) {}

  async bootstrap(_params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile: string;
  }): Promise<BootstrapResult> {
    return { bootstrapped: true };
  }

  async assemble(params: {
    sessionId: string;
    messages: AgentMessage[];
    prompt?: string;
  }): Promise<AssembleResult> {
    const blocks = await getContextBlocks(this.deps.aicloneHome);
    const systemPromptAddition = buildSystemPromptAddition(blocks);
    const _toolDecls = buildToolDeclarations();
    // NOTE(impl): toolDecls を upstream の tool registry と合流させる
    return {
      messages: params.messages,
      estimatedTokens: estimateTokens(systemPromptAddition),
      systemPromptAddition,
    };
  }

  async ingest(_params: {
    sessionId: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
  }): Promise<IngestResult> {
    // NOTE(impl): 会話中の同期圧縮は避け、dreaming 側で chunk -> short_memory + fact を生成する
    return { ingested: false };
  }

  async afterTurn(params: {
    sessionId: string;
    sessionFile: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
    isHeartbeat?: boolean;
  }): Promise<void> {
    // NOTE(impl): messages の tool_use 結果から accessed fact_ids / short_ids を抽出し logAccess する
    void params;
  }

  async compact(_params: {
    sessionId: string;
    sessionFile: string;
    tokenBudget?: number;
  }): Promise<CompactResult> {
    return { ok: true, compacted: false };
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    switch (name) {
      case "recall":
        return recall(this.deps.db, this.deps.embed, args as RecallParams);
      case "get_recent":
        return getRecentShortMemories(this.deps.db, args as { days: number; limit?: number });
      case "get_related":
        return getRelatedShortMemories(this.deps.db, args as { short_id: string; limit?: number });
      default:
        throw new Error(`unknown aiclone tool: ${name}`);
    }
  }

  logToolAccess(params: { fact_ids?: string[]; short_ids?: string[]; session_id?: string }): void {
    for (const factId of params.fact_ids ?? []) {
      logAccess(this.deps.db, { fact_id: factId, session_id: params.session_id, via: "recall" });
    }
    for (const shortId of params.short_ids ?? []) {
      logAccess(this.deps.db, { short_id: shortId, session_id: params.session_id, via: "recall" });
    }
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
