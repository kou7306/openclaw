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
  ensureSeedDomains,
  getContextBlocks,
  getRecentShortMemories,
  getRelatedShortMemories,
  listDomainsForIndex,
  logAccess,
  routeRecall,
  type DomainThemeSelector,
  type EmbedFn,
  type RecallParams,
} from "../memory/index.js";
import { buildSystemPromptAddition, buildToolDeclarations } from "./assemble.js";
import { createIntentResolver } from "./intent.js";

export type AiCloneEngineDeps = {
  db: DatabaseSync;
  embed: EmbedFn;
  aicloneHome: string;
  selectDomainsAndThemes: DomainThemeSelector;
  deepKeywords?: string[];
};

export class AiCloneEngine implements ContextEngine {
  readonly info: ContextEngineInfo = {
    id: "aiclone",
    name: "AI Clone Context Engine",
    version: "0.2.0",
  };

  private readonly classifyMode: ReturnType<typeof createIntentResolver>;

  constructor(private readonly deps: AiCloneEngineDeps) {
    this.classifyMode = createIntentResolver({ deepKeywords: deps.deepKeywords });
    ensureSeedDomains(deps.db);
  }

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
    const domains = listDomainsForIndex(this.deps.db, 8);
    const recentThemes = listRecentThemes(this.deps.db, 6);
    const systemPromptAddition = buildSystemPromptAddition(blocks, {
      domains,
      recentThemes,
    });
    const _toolDecls = buildToolDeclarations();
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
    return { ingested: false };
  }

  async afterTurn(params: {
    sessionId: string;
    sessionFile: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
    isHeartbeat?: boolean;
  }): Promise<void> {
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
        return routeRecall(
          {
            db: this.deps.db,
            embed: this.deps.embed,
            selectDomainsAndThemes: this.deps.selectDomainsAndThemes,
            classifyMode: this.classifyMode,
          },
          args as RecallParams,
        );
      case "get_recent":
        return getRecentShortMemories(this.deps.db, args as { days: number; limit?: number });
      case "get_related":
        return getRelatedShortMemories(this.deps.db, args as { short_id: string; limit?: number });
      default:
        throw new Error(`unknown aiclone tool: ${name}`);
    }
  }

  logToolAccess(params: {
    element_ids?: string[];
    short_ids?: string[];
    session_id?: string;
    mode?: "fast" | "deep";
  }): void {
    const via = params.mode === "deep" ? "recall_deep" : "recall_fast";
    for (const elementId of params.element_ids ?? []) {
      logAccess(this.deps.db, {
        element_id: elementId,
        session_id: params.session_id,
        via,
        mode: params.mode,
      });
    }
    for (const shortId of params.short_ids ?? []) {
      logAccess(this.deps.db, {
        short_id: shortId,
        session_id: params.session_id,
        via,
        mode: params.mode,
      });
    }
  }
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function listRecentThemes(db: DatabaseSync, limit: number): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM ai_themes
       ORDER BY last_used_at DESC NULLS LAST, usage_count DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}
