import type { ObservationInput } from "./observe.js";

export type UtteranceGenerator = (prompt: string) => Promise<string>;

export type GeneratedUtterance = {
  text: string;
  themes: string[];
};

export async function generateUtterance(
  generator: UtteranceGenerator,
  obs: ObservationInput,
): Promise<GeneratedUtterance | null> {
  const prompt = buildPrompt(obs);
  const raw = (await generator(prompt)).trim();
  if (!raw) {
    return null;
  }

  const parsed = tryParseJson(raw);
  if (parsed && typeof parsed.text === "string") {
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes.filter((t: unknown): t is string => typeof t === "string")
      : [];
    if (!parsed.text.trim()) {
      return null;
    }
    return { text: parsed.text.trim(), themes };
  }
  return { text: raw, themes: [] };
}

function buildPrompt(obs: ObservationInput): string {
  const themes = obs.trendingThemes.map((t) => t.name).join(", ") || "(none)";
  const recent =
    obs.recentShortMemories
      .slice(0, 5)
      .map((s) => `- ${s.summary}`)
      .join("\n") || "(none)";

  return [
    "You are kouta's personal AI partner observing the last 24 hours.",
    "Decide whether to say something short and proactive to the user (or stay silent).",
    "Constraints:",
    '- Output JSON: {"text": string | "", "themes": string[]}.',
    "- Set text to empty string if there is nothing worth saying right now.",
    "- Japanese. 1-2 sentences max. Do not repeat yesterday's remark.",
    "",
    "Working memory:",
    obs.workingText || "(empty)",
    "",
    "Recent short memories:",
    recent,
    "",
    "Active themes: " + themes,
  ].join("\n");
}

function tryParseJson(s: string): { text?: unknown; themes?: unknown } | null {
  const trimmed = s.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
