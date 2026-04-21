#!/usr/bin/env node
// reembed.ts — embedding モデルを差し替えた後に全 fact / short_memory を再埋め込みする

import { readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type EmbedFn = (text: string) => Promise<Float32Array>;

async function main() {
  const home = process.env.AICLONE_HOME ?? path.join(process.env.HOME ?? "", ".aiclone");
  const dbPath = path.join(home, "memory.db");
  const configPath = path.join(home, "config.json");

  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    llm: { embedding: { provider: string; dimension: number; runtime: string } };
  };
  const embedding = config.llm.embedding;

  const db = new DatabaseSync(dbPath);

  console.log(`reembed target: ${embedding.provider} / dim=${embedding.dimension}`);
  console.log("dropping vec tables...");
  db.prepare(`DROP TABLE IF EXISTS ai_fact_vec`).run();
  db.prepare(`DROP TABLE IF EXISTS ai_summary_vec`).run();
  db.prepare(
    `CREATE VIRTUAL TABLE ai_fact_vec    USING vec0(fact_id  TEXT PRIMARY KEY, embedding FLOAT[${embedding.dimension}])`,
  ).run();
  db.prepare(
    `CREATE VIRTUAL TABLE ai_summary_vec USING vec0(short_id TEXT PRIMARY KEY, embedding FLOAT[${embedding.dimension}])`,
  ).run();

  // NOTE(impl): BgeM3EmbeddingProvider 等をロードして使う
  const embed: EmbedFn = async () => {
    throw new Error("embed not wired in skeleton");
  };

  const facts = db.prepare(`SELECT fact_id, short_id, fact_text FROM ai_facts`).all() as Array<{
    fact_id: string;
    short_id: string;
    fact_text: string;
  }>;
  const summaries = db.prepare(`SELECT short_id, summary FROM ai_short_memories`).all() as Array<{
    short_id: string;
    summary: string;
  }>;

  console.log(`re-embedding ${summaries.length} short_memories...`);
  for (const s of summaries) {
    const vec = await embed(s.summary);
    db.prepare(`INSERT INTO ai_summary_vec(short_id, embedding) VALUES(?, ?)`).run(
      s.short_id,
      new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength),
    );
  }

  console.log(`re-embedding ${facts.length} facts...`);
  const summaryById = new Map(summaries.map((s) => [s.short_id, s.summary]));
  for (const f of facts) {
    const context = summaryById.get(f.short_id) ?? "";
    const vec = await embed(`${context}\n\n${f.fact_text}`);
    db.prepare(`INSERT INTO ai_fact_vec(fact_id, embedding) VALUES(?, ?)`).run(
      f.fact_id,
      new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength),
    );
  }

  db.prepare(
    `UPDATE ai_embedding_meta SET provider = ?, dimension = ?, runtime = ?, updated_at = ? WHERE key = 'current'`,
  ).run(embedding.provider, embedding.dimension, embedding.runtime, Date.now());

  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
