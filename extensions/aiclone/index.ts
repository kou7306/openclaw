import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import type { ContextEngine } from "../../src/context-engine/types.js";

/**
 * AI Clone plugin entry — Phase 1 minimal wiring.
 *
 * Goal for this commit: verify the registration path.
 * Full engine wiring (db, embed, persona/working injection) follows in the
 * next tickets (P1-25 / P1-31 / P1-54).
 */
export default definePluginEntry({
  id: "aiclone",
  name: "AI Clone",
  description: "kouta's personal AI partner (context engine, memory, heartbeat).",

  register(api: OpenClawPluginApi) {
    api.logger.info("aiclone: plugin loaded (Phase 1 minimal)");

    api.registerContextEngine("aiclone", async (): Promise<ContextEngine> => {
      api.logger.info("aiclone: context-engine factory invoked");
      return createStubEngine(api);
    });
  },
});

function createStubEngine(api: OpenClawPluginApi): ContextEngine {
  return {
    info: {
      id: "aiclone",
      name: "AI Clone Context Engine",
      version: "0.1.0",
    },
    async ingest() {
      return { ingested: false };
    },
    async assemble(params) {
      api.logger.debug("aiclone: assemble called (stub)");
      return {
        messages: params.messages,
        estimatedTokens: 0,
      };
    },
    async compact() {
      return { ok: true, compacted: false };
    },
  };
}
