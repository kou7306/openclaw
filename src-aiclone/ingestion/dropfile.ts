import { readFile } from "node:fs/promises";
import path from "node:path";

// NOTE(upstream): upstream の ingest API に差し替える
//   import { ingestFileIntoMemory } from "../../src/memory-host-sdk/runtime-files.js";

export type DropFileDeps = {
  ingest: (params: {
    path: string;
    content: string;
    source: string;
  }) => Promise<{ chunk_ids: string[] }>;
  onIngested?: (result: { path: string; chunk_ids: string[] }) => void | Promise<void>;
};

export async function handleDropFile(
  deps: DropFileDeps,
  filePath: string,
): Promise<{ chunk_ids: string[] }> {
  const absolute = path.resolve(filePath);
  const content = await readFile(absolute, "utf8");
  const source = sourceFromPath(absolute);
  const result = await deps.ingest({ path: absolute, content, source });
  await deps.onIngested?.({ path: absolute, chunk_ids: result.chunk_ids });
  return result;
}

function sourceFromPath(p: string): string {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".md" || ext === ".markdown") {
    return "manual_md";
  }
  return "manual";
}
