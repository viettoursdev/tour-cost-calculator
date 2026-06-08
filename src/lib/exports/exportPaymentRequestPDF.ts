/**
 * Export a Payment Request ("Phieu de nghi thanh toan") as a PDF.
 * Source: public/legacy.html:4958-5116.
 * Vietnamese text is written without diacritics so Helvetica renders cleanly
 * (matches the convention from exportContractPDF / exportAcceptanceCert).
 */
import { jsPDF } from 'jspdf';
import { numberToVietWords } from './vietWords';
import type {
  PaymentApprovalEntry, PaymentItem, QuoteInfo, User,
} from '@/types';

export interface PaymentRequestForm {
  supplier: string;
  content: string;
  amount: number;
  approver1: string;
  approver1Username: string;
  approver2: string;
  approver2Username: string;
  requester: string;
  note: string;
}

type RGB = [number, number, number];

const TEAL: RGB = [20, 160, 140];
const DARK: RGB = [15, 58, 74];
const GRAY: RGB = [120, 130, 140];
const RED: RGB = [220, 50, 80];
const GREEN: RGB = [39, 174, 96];

export function exportPaymentRequestPDF(
  form: PaymentRequestForm,
  ci: PaymentItem,
  info: QuoteInfo,
  user: User,
  approvalEntry?: PaymentApprovalEntry,
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const FONT = 'helvetica';
  const setFont = (s = 'normal') => pdf.setFont(FONT, s);
  const pageW = 210, pageH = 297, mX = 18;
  let y = 18;
  const fmtV = (n: number) => Math.round(n).toLocaleString('vi-VN');

  const now = new Date();
  const reqNo = `PTT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

  // Top teal stripe
  pdf.setFillColor(...TEAL); pdf.rect(0, 0, pageW, 4, 'F');

  // Header
  pdf.setFontSize(13); pdf.setTextColor(...TEAL); setFont('bold');
  pdf.text('VIETTOURS INCENTIVES & EVENTS', mX, y + 8);
  pdf.setFontSize(8); pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text('Cong ty TNHH Du lich va Su kien Viet - MST: 0302650371', mX, y + 13);
  y += 28;

  // Title
  pdf.setFontSize(18); pdf.setTextColor(...DARK); setFont('bold');
  pdf.text('PHIEU DE NGHI THANH TOAN', pageW / 2, y, { align: 'center' }); y += 6;
  pdf.setFontSize(10); pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text('PAYMENT REQUEST', pageW / 2, y, { align: 'center' }); y += 6;
  pdf.setFontSize(9); pdf.setTextColor(...DARK);
  pdf.text(`So / No: ${reqNo}`, pageW / 2, y, { align: 'center' });
  pdf.text(`Ngay / Date: ${now.toLocaleDateString('vi-VN')}`, pageW / 2, y + 5, { align: 'center' });
  y += 14;

  pdf.setDrawColor(...TEAL); pdf.setLineWidth(0.5); pdf.line(mX, y, pageW - mX, y); y += 10;

  // Field helper
  const field = (label: string, val: string, big = false) => {
    pdf.setFontSize(9); pdf.setTextColor(...TEAL); setFont('bold');
    pdf.text(label, mX, y); y += 5;
    pdf.setFontSize(big ? 13 : 10);
    pdf.setTextColor(...(big ? RED : DARK));
    setFont(big ? 'bold' : 'normal');
    const lines: string[] = pdf.splitTextToSize(val || '-', pageW - mX * 2);
    pdf.text(lines, mX, y);
    y += lines.length * (big ? 7 : 5) + 5;
  };

  // Requester
  pdf.setFontSize(9); pdf.setTextColor(...TEAL); setFont('bold');
  pdf.text('NGUOI DE NGHI / REQUESTER:', mX, y); y += 5;
  pdf.setFontSize(10); pdf.setTextColor(...DARK); setFont('bold');
  pdf.text(form.requester || user.name, mX, y); y += 8;
  pdf.setDrawColor(230, 230, 230); pdf.setLineWidth(0.2);
  pdf.line(mX, y, pageW - mX, y); y += 6;

  field('DU AN / TOUR:', `${info.name || ''}${info.dest ? ' - ' + info.dest : ''}`);
  field('NHA CUNG CAP / NGUOI NHAN:', form.supplier);
  field('NOI DUNG DE NGHI / CONTENT:', form.content);
  field('HANG MUC CHI PHI / CATEGORY:', `${ci.catLabel} - ${ci.name}`);
  field('SO TIEN DE NGHI / AMOUNT:', fmtV(form.amount) + ' VND', true);

  pdf.setFontSize(9); pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text(`Bang chu: ${numberToVietWords(form.amount)} dong.`, mX, y); y += 8;
  if (form.note) field('GHI CHU / NOTE:', form.note);
  y += 4;

  // Approval status section
  const renderStage = (stage: 1 | 2, stageData: NonNullable<PaymentApprovalEntry['stage1']>, label: string) => {
    const isOk = stageData.status === 'approved';
    const stC = isOk ? GREEN : RED;
    const stBg: RGB = isOk ? [236, 252, 243] : [254, 242, 242];
    const h = stageData.note ? 26 : 18;
    pdf.setFillColor(...stBg);
    pdf.roundedRect(mX, y, pageW - mX * 2, h, 3, 3, 'F');
    pdf.setDrawColor(...stC); pdf.setLineWidth(0.4);
    pdf.roundedRect(mX, y, pageW - mX * 2, h, 3, 3, 'S');
    pdf.setFontSize(8); pdf.setTextColor(...stC); setFont('bold');
    const icon = isOk ? 'DA DUYET' : 'TU CHOI';

    const intendedFromDB = (stage === 1
      ? approvalEntry?.intendedApprover1Name
      : approvalEntry?.intendedApprover2Name) || '';
    const intendedFromForm = (stage === 1 ? form.approver1 : form.approver2) || '';
    const actualName = (stageData.approverName || '').split('(')[0].trim();
    const personName = intendedFromDB.split('(')[0].trim()
      || intendedFromForm.split('(')[0].trim()
      || actualName;

    pdf.text(`${label}: ${icon}`, mX + 4, y + 6);
    setFont('normal');
    const at = stageData.updatedAt ? new Date(stageData.updatedAt).toLocaleDateString('vi-VN') : '';
    pdf.text(`${personName}${at ? ' - ' + at : ''}`, pageW - mX - 2, y + 6, { align: 'right' });
    if (stageData.note) {
      pdf.setFontSize(7.5); pdf.setTextColor(100, 100, 100); setFont('italic');
      const noteLines: string[] = pdf.splitTextToSize(`Ghi chu: ${stageData.note}`, pageW - mX * 2 - 8);
      pdf.text(noteLines, mX + 4, y + 14);
    }
    y += h + 4;
  };

  if (approvalEntry) {
    const isPending = approvalEntry.finalStatus === 'pending_stage2';
    if (approvalEntry.stage1) renderStage(1, approvalEntry.stage1, 'Duyet 1');
    if (approvalEntry.stage2) renderStage(2, approvalEntry.stage2, 'Duyet 2');
    if (isPending) {
      pdf.setFillColor(255, 251, 235);
      pdf.roundedRect(mX, y, pageW - mX * 2, 12, 3, 3, 'F');
      pdf.setDrawColor(245, 166, 35); pdf.setLineWidth(0.4);
      pdf.roundedRect(mX, y, pageW - mX * 2, 12, 3, 3, 'S');
      pdf.setFontSize(8); pdf.setTextColor(180, 120, 0); setFont('bold');
      pdf.text('CHO DUYET 2 / PENDING STAGE 2', pageW / 2, y + 7, { align: 'center' });
      y += 16;
    }
  } else {
    pdf.setFillColor(255, 251, 235);
    pdf.roundedRect(mX, y, pageW - mX * 2, 14, 3, 3, 'F');
    pdf.setDrawColor(245, 166, 35); pdf.setLineWidth(0.5);
    pdf.roundedRect(mX, y, pageW - mX * 2, 14, 3, 3, 'S');
    pdf.setFontSize(9); pdf.setTextColor(180, 120, 0); setFont('bold');
    pdf.text('CHO DUYET / PENDING APPROVAL', pageW / 2, y + 8, { align: 'center' });
    y += 20;
  }

  pdf.setDrawColor(...GRAY); pdf.setLineWidth(0.2); pdf.line(mX, y, pageW - mX, y); y += 14;

  // Signature row
  const sigW = (pageW - mX * 2) / 3;
  const apv1Name = (approvalEntry?.intendedApprover1Name || form.approver1
    || approvalEntry?.stage1?.approverName || '').split('(')[0].trim();
  const apv2Name = (approvalEntry?.intendedApprover2Name || form.approver2
    || approvalEntry?.stage2?.approverName || '').split('(')[0].trim();
  pdf.setFontSize(9); pdf.setTextColor(...DARK); setFont('bold');
  pdf.text('NGUOI DE NGHI', mX + sigW / 2, y, { align: 'center' });
  pdf.text('NGUOI DUYET 1', mX + sigW + sigW / 2, y, { align: 'center' });
  pdf.text('NGUOI DUYET 2', mX + sigW * 2 + sigW / 2, y, { align: 'center' });
  y += 4;
  pdf.setFontSize(7.5); pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text('(Requester)', mX + sigW / 2, y, { align: 'center' });
  pdf.text('(Approver 1)', mX + sigW + sigW / 2, y, { align: 'center' });
  pdf.text('(Approver 2)', mX + sigW * 2 + sigW / 2, y, { align: 'center' });
  y += 22;
  pdf.setFontSize(9); pdf.setTextColor(...DARK); setFont('bold');
  pdf.text(form.requester || user.name, mX + sigW / 2, y, { align: 'center' });
  pdf.text(apv1Name, mX + sigW + sigW / 2, y, { align: 'center' });
  pdf.text(apv2Name, mX + sigW * 2 + sigW / 2, y, { align: 'center' });

  // Footer
  pdf.setFillColor(...TEAL); pdf.rect(0, pageH - 4, pageW, 4, 'F');
  pdf.setFontSize(7.5); pdf.setTextColor(...TEAL); setFont('bold');
  pdf.text('Viettours Incentives & Events', mX, pageH - 8);
  pdf.setTextColor(...GRAY); setFont('normal');
  pdf.text(reqNo, pageW - mX, pageH - 8, { align: 'right' });

  pdf.save(`PhieuDeNghiTT_${reqNo}.pdf`);
}
