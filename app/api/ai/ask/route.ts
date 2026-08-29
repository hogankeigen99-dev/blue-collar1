import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { askJobQuestion } from "@/lib/ai/ask-job-question";
import { isAiConfigured } from "@/lib/ai/client";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI features aren't configured yet (ANTHROPIC_API_KEY is not set)." }, { status: 503 });
  }

  const { jobId, question } = (await request.json()) as { jobId?: string; question?: string };
  if (!jobId || !question?.trim()) {
    return NextResponse.json({ error: "jobId and question are required" }, { status: 400 });
  }

  try {
    const answer = await askJobQuestion(session.companyId, jobId, question);
    return NextResponse.json({ answer });
  } catch (err) {
    console.error("ask-job-question failed:", err);
    return NextResponse.json({ error: "Couldn't answer that right now." }, { status: 502 });
  }
}
