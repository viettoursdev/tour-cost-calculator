/**
 * Export a Biên bản nghiệm thu (Acceptance Certificate) PDF.
 * Source: public/legacy.html:9258-9340.
 */
import { jsPDF } from 'jspdf';
import { loadVNFont } from './vnFont';
import { drawLogo } from './brand';
import type { Contract, AcceptanceRecord } from '@/types';

type AcceptanceForm = { date: string; note: string; detail?: AcceptanceRecord };
type SavedBy = { name: string; role: string };

const fmtV = (n: number) => Math.round(n || 0).toLocaleString('vi-VN') + ' đ';

export function exportAcceptanceCertPDF(
  contract: Contract,
  form: AcceptanceForm,
  user: SavedBy,
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const pageW = 210, mX = 20, mX2 = 190;
  let y = 20;
  const ln = (h = 6) => { y += h; };
  const atX = (t: string, x: number, opts?: { align?: string }) =>
    pdf.text(t, x, y, opts as Parameters<typeof pdf.text>[3]);
  const atL = (t: string) => pdf.text(t, mX, y);
  const line = () => {
    pdf.setDrawColor(200); pdf.line(mX, y, mX2, y); ln(5);
  };

  pdf.setFont(FONT);

  // ── Logo (chuẩn 46.5×12.5mm) rồi header nhà nước căn giữa BÊN DƯỚI (không đè) ──
  y = drawLogo(pdf, mX, y - 2) + 5;
  pdf.setFontSize(11); pdf.setFont(FONT, 'bold');
  atX('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', pageW / 2, { align: 'center' }); ln(6);
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
  atX('Độc lập - Tự do - Hạnh phúc', pageW / 2, { align: 'center' }); ln(5);
  atX('----------', pageW / 2, { align: 'center' }); ln(10);
  pdf.setFontSize(15); pdf.setFont(FONT, 'bold');
  atX('BIÊN BẢN NGHIỆM THU DỊCH VỤ DU LỊCH', pageW / 2, { align: 'center' }); ln(7);
  pdf.setFontSize(11); pdf.setFont(FONT, 'italic');
  atX(`(Căn cứ Hợp đồng số: ${contract.contractNo || '_____'})`, pageW / 2, { align: 'center' }); ln(10);
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
  const dateStr = form.date
    ? new Date(form.date).toLocaleDateString('en-GB')
    : '__/__/____';
  atL(`Ngày ${dateStr}, tại TP. Hồ Chí Minh`); ln(10);

  // ── Bên A ──
  pdf.setFont(FONT, 'bold');
  atL('BÊN A (BÊN CUNG CẤP DỊCH VỤ):'); ln(6);
  pdf.setFont(FONT, 'normal');
  atL('Công ty Cổ phần Viettours Incentives & Events'); ln(5);
  atL('Địa chỉ: 268 Tô Hiến Thành, P.15, Q.10, TP. Hồ Chí Minh'); ln(5);
  atL(`Đại diện: ${user.name}`); ln(10);

  // ── Bên B ──
  pdf.setFont(FONT, 'bold');
  atL('BÊN B (ĐẠI DIỆN ĐOÀN KHÁCH):'); ln(6);
  pdf.setFont(FONT, 'normal');
  atL((contract.partyB?.name || '________________________').toUpperCase()); ln(5);
  if (contract.partyB?.address) { atL(`Địa chỉ: ${contract.partyB.address}`); ln(5); }
  if (contract.partyB?.rep) {
    atL(`Đại diện: ${contract.partyB.rep} - ${contract.partyB.title || ''}`); ln(5);
  }
  if (contract.partyB?.tel) { atL(`Điện thoại: ${contract.partyB.tel}`); ln(5); }
  ln(5); line();

  // ── Điều 1 ──
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
  atL('ĐIỀU 1: NỘI DUNG DỊCH VỤ NGHIỆM THU'); ln(7);
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
  const totalAmount = Math.round((+contract.pricePerPax || 0) * (+contract.contractPax || 0));
  const collected = (contract.payments ?? [])
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + ((p.receivedAmount ?? +p.amount) || 0), 0);
  const remaining = totalAmount - collected;
  const rows: [string, string][] = [
    ['Tên chương trình:', contract.tourName || '—'],
    ['Điểm đến:', contract.tourDest || '—'],
    ['Thời gian:', `${contract.tourDays || '—'}N${contract.tourNights || '—'}Đ`],
    ['Số khách:', `${contract.contractPax || '—'} khách`],
    ['Giá trị hợp đồng:', fmtV(totalAmount)],
    ['Đã thanh toán:', fmtV(collected)],
    ['Còn lại:', remaining > 0 ? fmtV(remaining) : 'Đã thanh toán đủ'],
  ];
  rows.forEach(([k, v]) => { atL(k); pdf.text(v, 80, y); ln(6); });
  ln(3); line();

  // ── Điều 2: checklist dịch vụ đã giao ──
  const services = form.detail?.services ?? [];
  if (services.length) {
    pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
    atL('ĐIỀU 2: DỊCH VỤ ĐÃ CUNG CẤP'); ln(7);
    pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
    services.forEach((s) => {
      const mark = s.delivered ? '[x]' : '[ ]';
      const lines = pdf.splitTextToSize(`${mark} ${s.label}`, mX2 - mX - 4);
      lines.forEach((l: string, i: number) => { pdf.text(l, mX + (i ? 6 : 0), y); ln(5.5); });
    });
    ln(3); line();
  }

  // ── Kết quả nghiệm thu ──
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
  atL(`ĐIỀU ${services.length ? 3 : 2}: KẾT QUẢ NGHIỆM THU`); ln(7);
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
  const noteText = form.note || 'Hai bên xác nhận dịch vụ du lịch đã được thực hiện đúng theo hợp đồng.';
  const noteLines = pdf.splitTextToSize(noteText, mX2 - mX);
  noteLines.forEach((l: string) => { atL(l); ln(5.5); });
  if (form.detail?.satisfaction) {
    // Tránh glyph ★/☆ (font DejaVu subset có thể thiếu → tofu). Dùng chữ.
    atL(`Mức hài lòng của khách: ${form.detail.satisfaction}/5 sao`); ln(5.5);
  }
  ln(3); line();

  // ── Cam kết thanh lý ──
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(11);
  atL(`ĐIỀU ${services.length ? 4 : 3}: CAM KẾT THANH LÝ HỢP ĐỒNG`); ln(7);
  pdf.setFont(FONT, 'normal'); pdf.setFontSize(10);
  atL(`Hợp đồng số ${contract.contractNo || '_____'} được coi là đã hoàn thành và thanh lý kể từ ngày ký biên bản này.`); ln(10);

  // ── Ký tên ──
  const sigY = y + 5;
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(10);
  pdf.text('ĐẠI DIỆN BÊN A', mX + 15, sigY, { align: 'center' });
  pdf.text('ĐẠI DIỆN BÊN B', mX2 - 15, sigY, { align: 'center' });
  pdf.setFont(FONT, 'italic'); pdf.setFontSize(9);
  pdf.text('(Ký, ghi rõ họ tên)', mX + 15, sigY + 5, { align: 'center' });
  pdf.text('(Ký, ghi rõ họ tên)', mX2 - 15, sigY + 5, { align: 'center' });
  pdf.setFont(FONT, 'bold'); pdf.setFontSize(10);
  const signA = form.detail?.repA || user.name;
  const signB = form.detail?.repB || contract.partyB?.rep || '';
  pdf.text(signA.toUpperCase(), mX + 15, sigY + 30, { align: 'center' });
  pdf.text(signB.toUpperCase(), mX2 - 15, sigY + 30, { align: 'center' });

  const safeName = `${contract.contractNo || 'HD'}_${(contract.partyB?.name || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20)}`;
  pdf.save(`BBNT_${safeName}.pdf`);
}
