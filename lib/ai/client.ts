import Anthropic from "@anthropic-ai/sdk";

// claude-sonnet-5 — the user explicitly chose the "balanced" tier over the
// skill's own default recommendation (claude-opus-5) when this was scoped,
// so every AI feature in this app should use this constant rather than a
// per-feature hardcoded model string.
export const AI_MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Every AI feature route goes through this — never construct an Anthropic
 * client directly, so there's one place that decides the model/config. */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Get one from console.anthropic.com (separate from any Claude Code login — this key is billed to your own account) and add it to .env."
    );
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function firstTextBlock(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block?.text ?? "";
}
