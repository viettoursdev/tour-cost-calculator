// scripts/etl/payments.mjs — tour_payments (+records/custom items) and payment_approvals (+stages).
import { insert } from './db.mjs';
import { iso } from './util.mjs';

export async function loadTourPayments(client, dump, r) {
  const docs = dump.collections.tour_payments ?? {};
  const rows = Object.entries(docs).map(([tourKey, x]) => ({
    tour_key: tourKey, updated_at: iso(x.updatedAt), updated_by: x.updatedBy ?? null,
  }));
  const inserted = await insert(client, 'tour_payments', rows, { select: 'id, tour_key' });
  const map = new Map(inserted.map((row) => [row.tour_key, row.id]));
  const records = [], custom = [];
  for (const [tourKey, x] of Object.entries(docs)) {
    const tpid = map.get(tourKey);
    for (const [recordKey, p] of Object.entries(x.payments ?? {})) {
      records.push({
        tour_payment_id: tpid, record_key: recordKey, supplier: p.supplier ?? null,
        tracked: p.tracked ?? null, custom_amount: p.customAmount ?? null,
        installments: p.installments ?? [], note: p.note ?? null,
      });
    }
    (x.customItems ?? []).forEach((ci, i) => custom.push({
      tour_payment_id: tpid, item_key: ci.key, cat_id: ci.catId, cat_label: ci.catLabel ?? null,
      cat_icon: ci.catIcon ?? null, cat_color: ci.catColor ?? null, name: ci.name ?? '',
      amount: ci.amount ?? 0, sort_order: i,
    }));
  }
  await insert(client, 'payment_records', records);
  await insert(client, 'custom_cost_items', custom);
}

export async function loadPaymentApprovals(client, dump, r) {
  const doc = dump.singles['viettours/payment_approvals'] ?? {};
  const rows = Object.entries(doc).map(([approvalKey, x]) => ({
    approval_key: approvalKey, current_stage: x.currentStage ?? null, final_status: x.finalStatus ?? null,
    intended_approver1_name: x.intendedApprover1Name ?? null, intended_approver2_name: x.intendedApprover2Name ?? null,
  }));
  const inserted = await insert(client, 'payment_approvals', rows, { select: 'id, approval_key' });
  const map = new Map(inserted.map((row) => [row.approval_key, row.id]));
  const stages = [];
  for (const [approvalKey, x] of Object.entries(doc)) {
    const aid = map.get(approvalKey);
    for (const stage of [1, 2]) {
      const s = x[`stage${stage}`];
      if (!s) continue;
      stages.push({
        approval_id: aid, stage, status: s.status, approver_user_id: r.resolve(s.approverUsername),
        approver_username: s.approverUsername ?? null, approver_name: s.approverName ?? null,
        note: s.note ?? '', updated_at: iso(s.updatedAt) ?? undefined,
      });
    }
  }
  await insert(client, 'payment_approval_stages', stages);
}
