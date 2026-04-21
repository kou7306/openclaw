import { AiCloneEngine, type AiCloneEngineDeps } from "./aiclone-engine.js";

export function registerAiCloneContextEngine(deps: AiCloneEngineDeps): AiCloneEngine {
  const engine = new AiCloneEngine(deps);
  // NOTE(upstream): upstream の context-engine registry に登録する
  //   import { registerContextEngine } from "../../src/context-engine/index.js";
  //   registerContextEngine("aiclone", () => engine);
  return engine;
}

export { AiCloneEngine, type AiCloneEngineDeps } from "./aiclone-engine.js";
export { buildSystemPromptAddition, buildToolDeclarations } from "./assemble.js";
