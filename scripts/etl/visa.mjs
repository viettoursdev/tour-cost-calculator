// scripts/etl/visa.mjs — visa_procedures + visa_projects (uuid[] staff/collab arrays).
import { insert } from './db.mjs';
import { iso, dateOnly, nameFromActor } from './util.mjs';

export async function loadVisaProcedures(client, dump, r) {
  const docs = Object.values(dump.collections.visa_procedures ?? {});
  const rows = docs.map((x) => ({
    legacy_id: x.id, code: x.code ?? '', title: x.title ?? '', country: x.country ?? '',
    visa_type: x.visaType ?? null, is_template: x.isTemplate ?? false,
    sections: x.sections ?? [], versions: x.versions ?? [],
    collaborators: r.resolveMany(x.collaborators), collaborator_usernames: x.collaborators ?? [],
    linked_quote_id: x.linkedQuoteId ?? null, linked_quote_name: x.linkedQuoteName ?? null,
    created_by: r.resolve(x.createdByUsername), created_by_username: x.createdByUsername ?? null,
    created_by_name: x.createdByName ?? null, created_at: iso(x.createdAt) ?? undefined,
    updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  await insert(client, 'visa_procedures', rows);
}

export async function loadVisaProjects(client, dump, r) {
  const projects = dump.singles['viettours/visa_projects']?.projects ?? [];
  const rows = projects.map((x) => ({
    legacy_id: x.id, code: x.code ?? '', name: x.name ?? '', country: x.country ?? '', status: x.status ?? 'planning',
    main_staff: r.resolveMany(x.mainStaff), support_staff: r.resolveMany(x.supportStaff),
    main_staff_usernames: x.mainStaff ?? [], support_staff_usernames: x.supportStaff ?? [],
    documents_summary: x.documentsSummary ?? '', linked_quote_id: x.linkedQuoteId ?? null,
    linked_quote_name: x.linkedQuoteName ?? null, linked_proc_ids: x.linkedProcIds ?? [],
    apply_count: x.applyCount ?? 0, passed_count: x.passedCount ?? 0, failed_count: x.failedCount ?? 0,
    have_visa_count: x.haveVisaCount ?? 0, pending_count: x.pendingCount ?? 0,
    start_date: dateOnly(x.startDate), departure_date: dateOnly(x.departureDate), end_date: dateOnly(x.endDate),
    milestones: x.milestones ?? [], applicants: x.applicants ?? [],
    collaborators: r.resolveMany(x.collaborators), collaborator_usernames: x.collaborators ?? [],
    created_by: r.resolve(x.createdByUsername), created_by_username: x.createdByUsername ?? null,
    created_by_name: x.createdByName ?? null, created_at: iso(x.createdAt) ?? undefined,
    updated_at: iso(x.updatedAt), updated_by_name: nameFromActor(x.updatedBy) || null,
  }));
  await insert(client, 'visa_projects', rows);
}
