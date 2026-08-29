import { prisma } from "@/lib/prisma";

/**
 * Models that carry their own companyId column and must always be scoped.
 * Everything else (JobCostCode, DailyReport, Invoice, ...) is a child record
 * reached only through an already-scoped parent (a Job, a Worker, ...), so it
 * doesn't need its own companyId or its own entry here — EXCEPT wherever code
 * looks such a child up directly by its own id without going through the
 * parent first (see app/api/photos/[id] and app/api/documents/[id], which
 * re-validate the parent chain manually instead).
 */
const TENANT_MODELS = new Set([
  "User",
  "Worker",
  "Customer",
  "Job",
  "CostCode",
  "Equipment",
  "ApiKey",
  "Webhook",
  "AccountingCategoryMapping",
  "ChecklistTemplateItem",
  "AuditLog",
  "Division",
  "Opportunity",
]);

const READ_OPS = new Set(["findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"]);
const WHERE_WRITE_OPS = new Set(["update", "updateMany", "delete", "deleteMany"]);

/**
 * Returns a Prisma Client scoped to one company. Use this — never the raw
 * `prisma` export — for any query reachable from an authenticated
 * page/action/route. The usual pattern is to shadow the module-level import:
 *
 *   const session = await requireSession();
 *   const prisma = scopedPrisma(session.companyId);
 *   // every prisma.xxx call below this line is now company-scoped
 *
 * findUnique/findUniqueOrThrow on a tenant model are refused outright — `id`
 * alone is a valid unique selector there, so a company boundary can't be
 * layered onto it after the fact the way it can for where clauses elsewhere.
 * Use findFirst (or findFirstOrThrow) with an explicit `id` in `where`
 * instead; the extension adds companyId to it automatically. upsert is left
 * untouched for the same structural reason — the handful of call sites that
 * need it pass the compound (companyId + unique key) selector explicitly.
 */
export function scopedPrisma(companyId: string) {
  if (!companyId) throw new Error("scopedPrisma() requires a companyId");

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }

          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            throw new Error(
              `Refusing ${operation} on tenant-scoped model "${model}" — use findFirst/findFirstOrThrow instead (see lib/tenant.ts).`
            );
          }

          const scopedArgs = { ...(args as Record<string, unknown>) };

          if (READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
            scopedArgs.where = { ...((scopedArgs.where as object) ?? {}), companyId };
          } else if (operation === "create") {
            scopedArgs.data = { ...((scopedArgs.data as object) ?? {}), companyId };
          } else if (operation === "createMany") {
            const data = scopedArgs.data;
            scopedArgs.data = Array.isArray(data)
              ? data.map((d: object) => ({ ...d, companyId }))
              : { ...((data as object) ?? {}), companyId };
          }

          return query(scopedArgs);
        },
      },
    },
  });
}
