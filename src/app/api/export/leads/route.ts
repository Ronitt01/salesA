import type { NextRequest } from "next/server";
import { writeAudit } from "@/server/audit";
import { getSessionContext, isAdmin } from "@/server/auth/context";
import { listLeadsForExport, parseLeadFilters } from "@/server/repositories/leads";
import { LEAD_STAGE_LABEL, SOURCE_KIND_LABEL } from "@/lib/labels";

/**
 * CSV export of the current Lead Explorer view.
 *
 * Permitted data only:
 *   - company fields, score and stage for every member
 *   - contact name and job title for every member
 *   - contact email only for owners and admins, and never for a contact marked
 *     do-not-contact
 * Every export is written to the audit log.
 */

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(request: NextRequest) {
  const ctx = await getSessionContext();
  const filters = parseLeadFilters(Object.fromEntries(request.nextUrl.searchParams));
  const now = new Date();
  const rows = await listLeadsForExport(ctx, filters, now);
  const includeEmail = isAdmin(ctx.role);

  const header = [
    "Company",
    "Domain",
    "Industry",
    "City",
    "State",
    "Employee range",
    "Opportunity score",
    "Priority",
    "Qualified",
    "Stage",
    "Recommended service",
    "Source",
    "Last researched",
    "Contact name",
    "Contact job title",
    ...(includeEmail ? ["Contact email"] : []),
    "Demo record",
  ];

  const lines = rows.map((r) =>
    [
      r.company_name,
      r.domain,
      r.industry_name,
      r.city,
      r.state,
      r.employee_range,
      r.opportunity_score,
      r.priority,
      r.is_qualified ? "Yes" : "No",
      LEAD_STAGE_LABEL[r.lead_stage],
      r.recommended_service_name,
      r.source_kind ? SOURCE_KIND_LABEL[r.source_kind] : "",
      r.last_researched_at ? r.last_researched_at.slice(0, 10) : "",
      r.contact_name,
      r.contact_job_title,
      ...(includeEmail ? [r.contact_do_not_contact ? "(withheld: do not contact)" : r.contact_email] : []),
      r.is_demo ? "Yes (synthetic)" : "No",
    ]
      .map(csvCell)
      .join(","),
  );

  await writeAudit(ctx, "leads.exported", "company", null, { rows: rows.length, includeEmail });

  // BOM so Excel reads UTF-8 correctly.
  const body = `﻿${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
  const stamp = now.toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hunter-leads-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
