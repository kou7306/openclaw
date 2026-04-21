import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const PERSONA_MAX_BYTES = 8 * 1024;
const WORKING_MAX_BYTES = 8 * 1024;

export type ContextBlocks = {
  persona: string;
  working: string;
  personaPath: string;
  workingPath: string;
};

export async function getContextBlocks(home: string): Promise<ContextBlocks> {
  const personaPath = path.join(home, "persona.md");
  const workingPath = path.join(home, "working.md");
  return {
    persona: await readIfExists(personaPath, PERSONA_MAX_BYTES),
    working: await readIfExists(workingPath, WORKING_MAX_BYTES),
    personaPath,
    workingPath,
  };
}

async function readIfExists(filePath: string, maxBytes: number): Promise<string> {
  try {
    const stats = await stat(filePath);
    if (stats.size > maxBytes) {
      const content = await readFile(filePath, "utf8");
      return content.slice(0, maxBytes);
    }
    return await readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw err;
  }
}
