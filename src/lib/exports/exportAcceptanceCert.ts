/**
 * Export a Biên bản nghiệm thu (Acceptance Certificate) PDF.
 * Source: public/legacy.html:9258-9340.
 */
import { jsPDF } from 'jspdf';
import type { Contract } from '@/types';

type AcceptanceForm = { date: string; note: string };
type SavedBy = { name: string; role: string };

export function exportAcceptanceCertPDF(
  contract: Contract,
  form: AcceptanceForm,
  user: SavedBy,
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, mX = 20, mX2 = 190;
  let y = 20;
  const ln = (h = 6) => { y += h; };
  const atX = (t: string, x: number, opts?: { align?: string }) =>
    pdf.text(t, x, y, opts as Parameters<typeof pdf.text>[3]);
  const atL = (t: string) => pdf.text(t, mX, y);
  const line = () => {
    pdf.setDrawColor(200); pdf.line(mX, y, mX2, y); ln(5);
  };

  pdf.setFont('helvetica');

  // ── Header (state header) ──
  pdf.setFontSize(11); pdf.setFont('helvetica', 'bold');
  atX('CONG HOA XA HOI CHU NGHIA VIET NAM', pageW / 2, { align: 'center' }); ln(6);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  atX('Doc lap - Tu do - Hanh phuc', pageW / 2, { align: 'center' }); ln(5);
  atX('----------', pageW / 2, { align: 'center' }); ln(10);
  pdf.setFontSize(15); pdf.setFont('helvetica', 'bold');
  atX('BIEN BAN NGHIEM THU DICH VU DU LICH', pageW / 2, { align: 'center' }); ln(7);
  pdf.setFontSize(11); pdf.setFont('helvetica', 'italic');
  atX(`(Can cu Hop dong so: ${contract.contractNo || '_____'})`, pageW / 2, { align: 'center' }); ln(10);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
  const dateStr = form.date
    ? new Date(form.date).toLocaleDateString('en-GB')
    : '__/__/____';
  atL(`Ngay ${dateStr}, tai TP. Ho Chi Minh`); ln(10);

  // ── Bên A ──
  pdf.setFont('helvetica', 'bold');
  atL('BEN A (BEN CUNG CAP DICH VU):'); ln(6);
  pdf.setFont('helvetica', 'normal');
  atL('Cong ty Co phan Viettours Incentives & Events'); ln(5);
  atL('Dia chi: 268 To Hien Thanh, P.15, Q.10, TP. Ho Chi Minh'); ln(5);
  atL(`Dai dien: ${user.name} - ${user.role}`); ln(10);

  // ── Bên B ──
  pdf.setFont('helvetica', 'bold');
  atL('BEN B (DAI DIEN DOAN KHACH):'); ln(6);
  pdf.setFont('helvetica', 'normal');
  atL((contract.partyB?.name || '________________________').toUpperCase()); ln(5);
  if (contract.partyB?.address) { atL(`Dia chi: ${contract.partyB.address}`); ln(5); }
  if (contract.partyB?.rep) {
    atL(`Dai dien: ${contract.partyB.rep} - ${contract.partyB.title || ''}`); ln(5);
  }
  if (contract.partyB?.tel) { atL(`Dien thoai: ${contract.partyB.tel}`); ln(5); }
  ln(5); line();

  // ── Điều 1 ──
  pdf.setFont(undefined as unknown as string, 'bold'); pdf.setFontSize(11);
  atL('DIEU 1: NOI DUNG DICH VU NGHIEM THU'); ln(7);
  pdf.setFont(undefined as unknown as string, 'normal'); pdf.setFontSize(10);
  const totalAmount = Math.round((+contract.pricePerPax || 0) * (+contract.contractPax || 0));
  const rows: [string, string][] = [
    ['Ten chuong trinh:', contract.tourName || '—'],
    ['Diem den:', contract.tourDest || '—'],
    ['Thoi gian:', `${contract.tourDays || '—'}N${contract.tourNights || '—'}D`],
    ['So khach:', `${contract.contractPax || '—'} khach`],
    ['Gia tri hop dong:', `${totalAmount.toLocaleString('vi-VN')} d`],
  ];
  rows.forEach(([k, v]) => { atL(k); pdf.text(v, 80, y); ln(6); });
  ln(3); line();

  // ── Điều 2 ──
  pdf.setFont(undefined as unknown as string, 'bold'); pdf.setFontSize(11);
  atL('DIEU 2: KET QUA NGHIEM THU'); ln(7);
  pdf.setFont(undefined as unknown as string, 'normal'); pdf.setFontSize(10);
  const noteText = form.note || 'Hai ben xac nhan dich vu du lich da duoc thuc hien dung theo hop dong.';
  const noteLines = pdf.splitTextToSize(noteText, mX2 - mX);
  noteLines.forEach((l: string) => { atL(l); ln(5.5); });
  ln(3); line();

  // ── Điều 3 ──
  pdf.setFont(undefined as unknown as string, 'bold'); pdf.setFontSize(11);
  atL('DIEU 3: CAM KET THANH LY HOP DONG'); ln(7);
  pdf.setFont(undefined as unknown as string, 'normal'); pdf.setFontSize(10);
  atL(`Hop dong so ${contract.contractNo || '_____'} duoc coi la da hoan thanh va thanh ly ke tu ngay ky bien ban nay.`); ln(10);

  // ── Ký tên ──
  const sigY = y + 5;
  pdf.setFont(undefined as unknown as string, 'bold'); pdf.setFontSize(10);
  pdf.text('DAI DIEN BEN A', mX + 15, sigY, { align: 'center' });
  pdf.text('DAI DIEN BEN B', mX2 - 15, sigY, { align: 'center' });
  pdf.setFont(undefined as unknown as string, 'italic'); pdf.setFontSize(9);
  pdf.text('(Ky, ghi ro ho ten)', mX + 15, sigY + 5, { align: 'center' });
  pdf.text('(Ky, ghi ro ho ten)', mX2 - 15, sigY + 5, { align: 'center' });
  pdf.setFont(undefined as unknown as string, 'bold'); pdf.setFontSize(10);
  pdf.text(user.name.toUpperCase(), mX + 15, sigY + 30, { align: 'center' });
  pdf.text((contract.partyB?.rep || '').toUpperCase(), mX2 - 15, sigY + 30, { align: 'center' });

  const safeName = `${contract.contractNo || 'HD'}_${(contract.partyB?.name || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20)}`;
  pdf.save(`BBNT_${safeName}.pdf`);
}
