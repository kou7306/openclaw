// NOTE(upstream): fork 後は upstream の実型に差し替える
//   import type {
//     MemoryEmbeddingProvider,
//     MemoryEmbeddingProviderAdapter,
//     MemoryEmbeddingProviderCreateOptions,
//     MemoryEmbeddingProviderCreateResult,
//   } from "../../src/plugins/memory-embedding-providers.js";

export type BgeM3Config = {
  endpoint: string;
  model: string;
  dimension: number;
};

export const DEFAULT_BGE_M3_CONFIG: BgeM3Config = {
  endpoint: "http://127.0.0.1:11434",
  model: "bge-m3",
  dimension: 1024,
};

export class BgeM3EmbeddingProvider {
  readonly name = "bge-m3";
  readonly dimension: number;

  constructor(private readonly config: BgeM3Config = DEFAULT_BGE_M3_CONFIG) {
    this.dimension = config.dimension;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    const results: Float32Array[] = [];
    for (const text of texts) {
      results.push(await this.embedOne(text));
    }
    return results;
  }

  async embedOne(text: string): Promise<Float32Array> {
    const res = await fetch(`${this.config.endpoint}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: this.config.model, prompt: text }),
    });
    if (!res.ok) {
      throw new Error(`bge-m3 embedding failed: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { embedding?: number[] };
    if (!body.embedding) {
      throw new Error(`bge-m3 response missing embedding field`);
    }
    if (body.embedding.length !== this.config.dimension) {
      throw new Error(
        `bge-m3 dimension mismatch: got ${body.embedding.length}, expected ${this.config.dimension}`,
      );
    }
    return new Float32Array(body.embedding);
  }
}

export function registerBgeM3Adapter(
  config: BgeM3Config = DEFAULT_BGE_M3_CONFIG,
): BgeM3EmbeddingProvider {
  const provider = new BgeM3EmbeddingProvider(config);
  // NOTE(upstream): upstream の adapter registry に登録
  //   registerMemoryEmbeddingProviderAdapter("bge-m3", { create: async () => provider });
  return provider;
}
