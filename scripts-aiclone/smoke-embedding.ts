#!/usr/bin/env node
import { BgeM3EmbeddingProvider } from "../src-aiclone/embedding/bge-m3-adapter.js";

async function main() {
  const provider = new BgeM3EmbeddingProvider();
  console.log(`provider=${provider.name} dim=${provider.dimension}`);

  const samples = [
    "kouta はエンジニアでつくばチャレンジに参加している",
    "ai-clone の記憶設計を進めている",
    "BGE-M3 is a multilingual, multi-functional, multi-granularity embedding model",
  ];

  const start = Date.now();
  const vecs = await provider.embed(samples);
  const elapsedMs = Date.now() - start;

  for (const [i, v] of vecs.entries()) {
    console.log(
      `[${i}] dim=${v.length} first5=[${Array.from(v.slice(0, 5))
        .map((x) => x.toFixed(4))
        .join(", ")}] ‖norm‖=${norm(v).toFixed(4)}`,
    );
  }

  const sim01 = cosine(vecs[0]!, vecs[1]!);
  const sim02 = cosine(vecs[0]!, vecs[2]!);
  console.log(`cosine(0,1 近い話題)=${sim01.toFixed(4)}`);
  console.log(`cosine(0,2 違う話題)=${sim02.toFixed(4)}`);
  console.log(`total=${elapsedMs}ms`);
}

function norm(v: Float32Array): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
