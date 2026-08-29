import { scopedPrisma } from "@/lib/tenant";
import { getAnthropicClient, firstTextBlock, AI_MODEL } from "@/lib/ai/client";

const SYSTEM_PROMPT =
  "You are a construction project assistant summarizing daily field reports for a project manager. " +
  "Be concise and actionable: call out blockers, safety issues, material/equipment problems, and " +
  "flagged change conditions first, then a brief note on overall progress. Plain text, no markdown " +
  "headers or bullet characters — short paragraphs and line breaks only. If there's nothing notable, say so plainly.";

export async function summarizeJobFieldReports(companyId: string, jobId: string): Promise<string> {
  const prisma = scopedPrisma(companyId);
  const job = await prisma.job.findFirst({ where: { id: jobId }, select: { title: true } });
  if (!job) throw new Error("Job not found");

  const reports = await prisma.dailyReport.findMany({
    where: { jobId },
    orderBy: { date: "desc" },
    take: 14,
    include: { submittedBy: { select: { name: true } } },
  });
  if (reports.length === 0) return "No daily reports have been submitted for this job yet.";

  const reportLines = reports
    .slice()
    .reverse()
    .map((r) => {
      const parts = [
        r.workCompleted && `Work: ${r.workCompleted}`,
        r.quantityInstalled && `Installed: ${r.quantityInstalled}`,
        r.blockers && `BLOCKER: ${r.blockers}`,
        r.materialNeeded && `Material needed: ${r.materialNeeded}`,
        r.equipmentIssue && `Equipment issue: ${r.equipmentIssue}`,
        r.safetyIssue && `SAFETY: ${r.safetyIssue}`,
        r.hasChangeCondition && `CHANGE CONDITION: ${r.changeConditionNotes ?? "(flagged, no notes)"}`,
        r.delayReason && `Delay: ${r.delayReason}`,
      ].filter(Boolean);
      const crew = [r.crewSize && `crew of ${r.crewSize}`, r.hours && `${r.hours} hrs`].filter(Boolean).join(", ");
      const who = r.submittedBy ? ` — ${r.submittedBy.name}` : "";
      return `${r.date.toISOString().slice(0, 10)}${who}${crew ? ` (${crew})` : ""}: ${parts.join("; ") || "no notes recorded"}`;
    })
    .join("\n");

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Job: ${job.title}\n\nDaily field reports (oldest to newest):\n${reportLines}`,
      },
    ],
  });

  return firstTextBlock(response.content);
}
