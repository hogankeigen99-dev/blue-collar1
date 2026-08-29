import { scopedPrisma } from "@/lib/tenant";
import { getAnthropicClient, firstTextBlock, AI_MODEL } from "@/lib/ai/client";

const SYSTEM_PROMPT =
  "You draft clear, professional construction change order titles and descriptions from a " +
  "foreman's raw field notes about a change condition (unplanned work outside the original " +
  "scope). Respond with ONLY a JSON object, no markdown fences, no other text: " +
  '{"title": "<under 80 characters>", "description": "<2-4 sentences, professional tone, ' +
  "states what changed, where, and why it's outside the original scope>\"}.";

export type DraftedChangeOrder = { title: string; description: string };

function parseDraft(text: string): DraftedChangeOrder {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).title !== "string" ||
    typeof (parsed as Record<string, unknown>).description !== "string"
  ) {
    throw new Error("AI response wasn't in the expected {title, description} shape");
  }
  return parsed as DraftedChangeOrder;
}

export async function draftChangeOrder(companyId: string, jobId: string, rawNotes: string): Promise<DraftedChangeOrder> {
  const prisma = scopedPrisma(companyId);
  const job = await prisma.job.findFirst({ where: { id: jobId }, select: { title: true } });
  if (!job) throw new Error("Job not found");
  if (!rawNotes.trim()) throw new Error("Field notes are required to draft from");

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 512,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Job: ${job.title}\n\nField notes:\n${rawNotes}` }],
  });

  return parseDraft(firstTextBlock(response.content));
}
