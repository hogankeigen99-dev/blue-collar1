import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { draftChangeOrder } from "@/lib/ai/draft-change-order";
import { isAiConfigured } from "@/lib/ai/client";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI features aren't configured yet (ANTHROPIC_API_KEY is not set)." }, { status: 503 });
  }

  const { jobId, notes } = (await request.json()) as { jobId?: string; notes?: string };
  if (!jobId || !notes) return NextResponse.json({ error: "jobId and notes are required" }, { status: 400 });

  try {
    const draft = await draftChangeOrder(session.companyId, jobId, notes);
    return NextResponse.json(draft);
  } catch (err) {
    console.error("draft-change-order failed:", err);
    return NextResponse.json({ error: "Couldn't draft a change order right now." }, { status: 502 });
  }
}
