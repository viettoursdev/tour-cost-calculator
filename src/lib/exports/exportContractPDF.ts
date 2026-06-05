/**
 * Export a Contract as a PDF file.
 * Source: public/legacy.html:5943-6150.
 * Note: Vietnamese characters use Helvetica (jsPDF built-in).
 */
import { jsPDF } from 'jspdf';
import { numberToVietWords } from './vietWords';
import type { Contract } from '@/types';

export function exportContractPDF(contract: Contract): void {
  const form = contract;
  const totalAmount = Math.round((+form.pricePerPax || 0) * (+form.contractPax || 0));
  const startD = form.tourStartDate ? new Date(form.tourStartDate) : new Date();
  const endD = new Date(startD.getTime() + ((form.tourDays || 1) - 1) * 86400000);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const FONT = 'helvetica';
  const setFont = (s = 'normal') => pdf.setFont(FONT, s);
  const pageW = 210, pageH = 297, mX = 20;
  const contentW = pageW - mX * 2;
  const teal: [number, number, number] = [20, 160, 140];
  const dark: [number, number, number] = [15, 58, 74];
  const gray: [number, number, number] = [120, 130, 140];
  const red: [number, number, number] = [220, 50, 80];
  let y = 18;
  const fmtV = (n: number) => Math.round(n).toLocaleString('vi-VN');
  const fmtD = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const checkPage = (needed = 15) => {
    if (y + needed > pageH - 20) { pdf.addPage(); y = 20; }
  };
  const writeLine = (text: string, opts: {
    size?: number; style?: string; color?: [number, number, number];
    align?: 'left' | 'center' | 'right'; x?: number; indent?: number;
    spaceAfter?: number; maxW?: number;
  } = {}) => {
    const { size = 10, style = 'normal', color = dark, align = 'left', x = mX, indent = 0, spaceAfter = 4, maxW = contentW - indent } = opts;
    pdf.setFontSize(size); pdf.setTextColor(...color); setFont(style);
    const lines: string[] = pdf.splitTextToSize(text, maxW);
    checkPage(lines.length * (size * 0.42) + spaceAfter);
    if (align === 'center') pdf.text(lines, pageW / 2, y, { align: 'center' });
    else if (align === 'right') pdf.text(lines, pageW - mX, y, { align: 'right' });
    else pdf.text(lines, x + indent, y);
    y += lines.length * (size * 0.42) + spaceAfter;
  };

  // ── State header ──
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...dark);
  pdf.text('CONG HOA XA HOI CHU NGHIA VIET NAM', pageW / 2, y, { align: 'center' }); y += 5;
  pdf.text('Doc lap - Tu do - Hanh phuc', pageW / 2, y, { align: 'center' }); y += 2;
  pdf.setDrawColor(...dark); pdf.setLineWidth(0.3); pdf.line(pageW / 2 - 25, y + 1, pageW / 2 + 25, y + 1); y += 10;

  // ── Title ──
  setFont('bold'); pdf.setFontSize(17); pdf.setTextColor(...teal);
  pdf.text('HOP DONG CUNG CAP DICH VU', pageW / 2, y, { align: 'center' }); y += 6;
  setFont('normal'); pdf.setFontSize(10); pdf.setTextColor(...gray);
  pdf.text(`(HD So: ${form.contractNo || '_______/HD-VTE'})`, pageW / 2, y, { align: 'center' }); y += 10;

  // ── Legal basis ──
  pdf.setFontSize(9); pdf.setTextColor(...dark);
  [
    'Can cu Bo luat Dan su 2015, co hieu luc tu ngay 01/01/2017 va cac van ban huong dan thi hanh;',
    'Can cu Luat Thuong mai 2005, co hieu luc tu ngay 01/01/2006 va cac van ban huong dan thi hanh;',
    'Can cu Luat Du lich 2017, co hieu luc tu ngay 01/01/2018 va cac van ban huong dan thi hanh;',
    'Can cu vao nhu cau va kha nang cua hai ben.',
  ].forEach(b => writeLine('• ' + b, { size: 9, spaceAfter: 2 }));
  y += 4;

  setFont('normal'); pdf.setFontSize(10);
  pdf.text(`Hom nay, ngay ${form.contractDate}, chung toi gom co:`, mX, y); y += 8;

  // ── Bên A ──
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...teal);
  pdf.text('BEN A: CONG TY TNHH DU LICH VA SU KIEN VIET (VIETTOURS)', mX, y); y += 6;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  const sideARows: [string, string][] = [
    ['Dia chi:', '19B Mai Thi Luu, Phuong Tan Dinh, TP. Ho Chi Minh'],
    ['Tel:', '(028) 38 218 218 – 38 217 217          Fax: (028) 38 218 999'],
    ['Dai dien boi:', 'Ong HOANG ANH TUAN     Chuc vu: Giam Doc Dieu Hanh'],
    ['So tai khoan:', '007.100.075.5134 (VND) tai Ngan hang Vietcombank – TP. HCM'],
    ['Ma so thue:', '0302650371'],
  ];
  sideARows.forEach(([k, v]) => {
    setFont('bold'); pdf.text(k, mX, y);
    setFont('normal'); pdf.text(v, mX + 30, y); y += 5;
  });
  y += 4;

  // ── Bên B ──
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...teal);
  pdf.text(`BEN B: ${(form.partyB.name || '________________________').toUpperCase()}`, mX, y); y += 6;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  const sideBRows: [string, string][] = [
    ['Dia chi:', form.partyB.address || '_________________'],
    ['Tel:', form.partyB.tel || '_________________'],
    ['Dai dien boi:', `${form.partyB.rep || '_______________'}     Chuc vu: ${form.partyB.title || '_______'}`],
    ['Ma so thue:', form.partyB.taxCode || '_________________'],
    ['Email:', form.partyB.email || '_________________'],
  ];
  sideBRows.forEach(([k, v]) => {
    setFont('bold'); pdf.text(k, mX, y);
    setFont('normal');
    const lines: string[] = pdf.splitTextToSize(v, contentW - 30);
    pdf.text(lines, mX + 30, y); y += Math.max(5, lines.length * 4.5);
  });
  y += 6;

  setFont('normal'); pdf.setFontSize(10);
  pdf.text('Sau khi thoa thuan, hai ben dong y ky hop dong nay voi cac dieu khoan sau:', mX, y); y += 10;

  // ── Điều 1 ──
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('DIEU 1: NOI DUNG CHI TIET', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(10); pdf.setTextColor(...dark);
  writeLine(
    `Ben B dong y chon Ben A to chuc Chuong trinh tai ${form.tourDest || '...'} cho doan ${form.contractPax} khach khoi hanh tu ${form.departure} tu ngay ${form.tourStartDate ? fmtD(startD) : '___/___/______'} den ngay ${form.tourStartDate ? fmtD(endD) : '___/___/______'}.`,
    { size: 10, spaceAfter: 6 },
  );

  setFont('bold'); pdf.setFontSize(10);
  pdf.text('Gia tour:', mX, y); y += 6;
  setFont('normal');
  pdf.setFillColor(245, 250, 248); pdf.setDrawColor(...teal); pdf.setLineWidth(0.3);
  pdf.roundedRect(mX, y - 3, contentW, 12, 2, 2, 'FD');
  setFont('bold'); pdf.setTextColor(...dark); pdf.setFontSize(10);
  pdf.text(
    `${fmtV(form.pricePerPax)} VND/khach  x  ${form.contractPax} khach  =  ${fmtV(totalAmount)} VND`,
    pageW / 2, y + 4, { align: 'center' },
  );
  y += 14;
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...red);
  pdf.text(`Tong gia tri HD (da bao gom VAT): ${fmtV(totalAmount)} VND`, mX, y); y += 6;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...gray);
  writeLine(`(Bang chu: ${numberToVietWords(totalAmount)} dong.)`, { size: 9.5, color: gray, spaceAfter: 6 });

  // ── Includes / Excludes ──
  checkPage(25);
  setFont('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...teal);
  pdf.text('Bao gom:', mX, y); y += 5;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  (form.includes || []).forEach(it => { if (it.trim()) writeLine('• ' + it, { size: 9.5, indent: 4, spaceAfter: 1.5, maxW: contentW - 8 }); });
  y += 3;

  checkPage(25);
  setFont('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...red);
  pdf.text('Khong bao gom:', mX, y); y += 5;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  (form.excludes || []).forEach(it => { if (it.trim()) writeLine('• ' + it, { size: 9.5, indent: 4, spaceAfter: 1.5, maxW: contentW - 8 }); });
  y += 6;

  // ── Điều 2: Bên A ──
  checkPage(40);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('DIEU 2: TRACH NHIEM BEN A', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  [
    'Trong truong hop vi ly do thoi tiet hay cac ly do khac co the xay ra, dan den viec khong the thuc hien duoc mot phan chuong trinh tham quan, Ben A co the thay the bang cac chuong trinh tuong duong voi su dong y cua Ben B.',
    'Cam ket thuc hien dung cac tuyen diem tham quan, khach san va nha hang nhu chuong trinh da bao cho Ben B.',
    'Ben A dam bao cac dich vu di kem chuyen di nhu an uong, di chuyen, khach san phai dat tieu chuan ve an toan, ve sinh thuc pham.',
    'Chuan bi cac dieu kien ve an o, di lai, huong dan vien, chuong trinh tham quan theo dung nhu thoa thuan ban dau voi Ben B.',
    'Mua bao hiem du lich cho khach hang theo thoa thuan.',
    'Thong bao ngay cho Ben B trong truong hop thong tin khong day du de thuc hien cong viec.',
    'Cac trach nhiem khac theo Hop dong nay va theo quy dinh phap luat.',
  ].forEach(r => writeLine('• ' + r, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  y += 4;

  // ── Điều 3: Bên B ──
  checkPage(30);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('DIEU 3: TRACH NHIEM BEN B', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  [
    'Cung cap cho Ben A danh sach doan voi day du thong tin ca nhan, so dien thoai va toan bo ho chieu cua khach.',
    'Bao dam khach phai co ho chieu hop le (Ho chieu phai con thoi han su dung truoc thoi gian khoi hanh tren 6 thang).',
    'Trong thoi gian tham du chuyen di, cac thanh vien Ben B phai tuan thu theo chuong trinh.',
    'Thanh toan dung theo quy dinh tai Dieu 1 va Dieu 4 cua Hop dong.',
    'Cac quyen va nghia vu khac theo quy dinh cua phap luat.',
  ].forEach(r => writeLine('• ' + r, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  y += 4;

  // ── Điều 4: Thanh toán ──
  checkPage(30);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('DIEU 4: THANH TOAN', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  pdf.text(`Viec thanh toan duoc tien hanh theo ${(form.payments || []).length} dot bang hinh thuc chuyen khoan qua ngan hang:`, mX, y); y += 6;
  (form.payments || []).forEach((p, i) => {
    const amt = p.percent !== undefined
      ? Math.round(totalAmount * (p.percent / 100))
      : (p.amount || 0);
    const pct = p.percent ?? (totalAmount > 0 ? +((p.amount / totalAmount) * 100).toFixed(2) : 0);
    setFont('bold'); pdf.setFontSize(9.5); pdf.setTextColor(...teal);
    pdf.text(`Dot ${i + 1}:`, mX + 4, y);
    setFont('normal'); pdf.setTextColor(...dark);
    const txt2 = `${p.label} – Thanh toan ${pct}% gia tri HD, tuong duong ${fmtV(amt)} VND${p.note ? '. ' + p.note : ''}.`;
    const lines: string[] = pdf.splitTextToSize(txt2, contentW - 22);
    pdf.text(lines, mX + 18, y);
    y += Math.max(5, lines.length * 4.5) + 2;
    checkPage(10);
  });
  y += 4;

  // ── Điều 5: Phạt hủy ──
  checkPage(35);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('DIEU 5: PHAT HUY', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  writeLine('Truong hop khach khong the tham du chuyen di, Ben B phai thanh toan cac chi phi phat huy:', { size: 9.5, spaceAfter: 4 });
  (form.cancels || []).forEach(c => writeLine(`• ${c.when}: ${c.penalty}% gia tron goi cho 01 khach tinh tren so luong khach huy.`, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  writeLine(`• Trong truong hop mot (01) ben vi pham nghia vu da thoa thuan trong hop dong thi phai boi thuong cho ben bi vi pham ${form.bondPercent}% gia tri phan nghia vu hop dong bi vi pham.`, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 });
  y += 4;

  // ── Điều 6 ──
  checkPage(50);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('DIEU 6: CAC DIEU KHOAN CHUNG', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  [
    'Ben A se khong chiu trach nhiem cho cac chuyen bay bi dinh hoan do thoi tiet, chien tranh, khung bo, dinh cong, thien tai, hoa hoan.',
    'Neu co su co xay ra trong qua trinh di tour, Ben B uy quyen toan bo cho Ben A de lien lac, chuan bi ho so boi thuong va nhan tien boi thuong bao hiem cho khach.',
    'Trong truong hop Hop Dong khong the thuc hien duoc do Su Kien Bat Kha Khang, hai ben se cung thuong luong de tim ra huong giai quyet.',
    'Trong qua trinh thuc hien thoa thuan, hai Ben co the tien hanh sua doi va bo sung mot so dieu khoan trong thoa thuan nay voi dieu kien la viec sua doi phai lap thanh van ban.',
    'Hop dong nay duoc lap thanh 02 (hai) ban bang tieng Viet, moi Ben giu 01 (mot) ban co gia tri ngang nhau va co hieu luc ke tu ngay ky.',
  ].forEach(g => writeLine('• ' + g, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  y += 10;

  // ── Ký tên ──
  checkPage(50);
  const sigW = contentW / 2;
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...dark);
  pdf.text('DAI DIEN BEN B', mX + sigW / 2, y, { align: 'center' });
  pdf.text('DAI DIEN BEN A', mX + sigW + sigW / 2, y, { align: 'center' });
  y += 5;
  setFont('normal'); pdf.setFontSize(9); pdf.setTextColor(...gray);
  pdf.text('(Ky va dong dau)', mX + sigW / 2, y, { align: 'center' });
  pdf.text('(Ky va dong dau)', mX + sigW + sigW / 2, y, { align: 'center' });
  y += 30;
  setFont('bold'); pdf.setFontSize(10); pdf.setTextColor(...dark);
  pdf.text((form.partyB.rep || '_______________').toUpperCase(), mX + sigW / 2, y, { align: 'center' });
  pdf.text('Ong HOANG ANH TUAN', mX + sigW + sigW / 2, y, { align: 'center' });
  y += 5;
  setFont('normal'); pdf.setFontSize(9); pdf.setTextColor(...gray);
  pdf.text(`(${form.partyB.title || 'Giam doc'})`, mX + sigW / 2, y, { align: 'center' });
  pdf.text('(Giam Doc Dieu Hanh)', mX + sigW + sigW / 2, y, { align: 'center' });

  // ── Footer on each page ──
  const totalPages = (pdf.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFillColor(...teal); pdf.rect(0, pageH - 4, pageW, 4, 'F');
    pdf.setFontSize(8); pdf.setTextColor(...teal); setFont('bold');
    pdf.text('Viettours Incentives & Events', mX, pageH - 8);
    setFont('normal'); pdf.setTextColor(...gray);
    pdf.text(`Trang ${p}/${totalPages}`, pageW - mX, pageH - 8, { align: 'right' });
  }

  const safeName = (form.partyB.name || form.tourName || 'HD').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  pdf.save(`HopDong_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
