import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { summarizeJobFieldReports } from "@/lib/ai/summarize-reports";
import { isAiConfigured } from "@/lib/ai/client";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI features aren't configured yet (ANTHROPIC_API_KEY is not set)." }, { status: 503 });
  }

  const { jobId } = (await request.json()) as { jobId?: string };
  if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 400 });

  try {
    const summary = await summarizeJobFieldReports(session.companyId, jobId);
    return NextResponse.json({ summary });
  } catch (err) {
    console.error("summarize-reports failed:", err);
    return NextResponse.json({ error: "Couldn't generate a summary right now." }, { status: 502 });
  }
}
