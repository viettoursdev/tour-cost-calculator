/**
 * Export a Contract as a PDF file.
 * Source: public/legacy.html:5943-6150.
 * Uses bundled DejaVu Sans for Vietnamese diacritics.
 */
import { jsPDF } from 'jspdf';
import { numberToVietWords } from './vietWords';
import { loadVNFont } from './vnFont';
import { BRAND_TEAL } from './brand';
import type { Contract } from '@/types';

function buildContractPDF(contract: Contract): { pdf: jsPDF; filename: string } {
  const form = contract;
  const totalAmount = Math.round((+form.pricePerPax || 0) * (+form.contractPax || 0));
  const startD = form.tourStartDate ? new Date(form.tourStartDate) : new Date();
  const endD = new Date(startD.getTime() + ((form.tourDays || 1) - 1) * 86400000);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const hasFont = loadVNFont(pdf);
  const FONT = hasFont ? 'DejaVu' : 'helvetica';
  const setFont = (s = 'normal') => pdf.setFont(FONT, s);
  const pageW = 210, pageH = 297, mX = 20;
  const contentW = pageW - mX * 2;
  const teal: [number, number, number] = BRAND_TEAL;
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
  pdf.text('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', pageW / 2, y, { align: 'center' }); y += 5;
  pdf.text('Độc lập - Tự do - Hạnh phúc', pageW / 2, y, { align: 'center' }); y += 2;
  pdf.setDrawColor(...dark); pdf.setLineWidth(0.3); pdf.line(pageW / 2 - 25, y + 1, pageW / 2 + 25, y + 1); y += 10;

  // ── Title ──
  setFont('bold'); pdf.setFontSize(17); pdf.setTextColor(...teal);
  pdf.text('HỢP ĐỒNG CUNG CẤP DỊCH VỤ', pageW / 2, y, { align: 'center' }); y += 6;
  setFont('normal'); pdf.setFontSize(10); pdf.setTextColor(...gray);
  pdf.text(`(HĐ Số: ${form.contractNo || '_______/HD-VTE'})`, pageW / 2, y, { align: 'center' }); y += 10;

  // ── Legal basis ──
  pdf.setFontSize(9); pdf.setTextColor(...dark);
  [
    'Căn cứ Bộ luật Dân sự 2015, có hiệu lực từ ngày 01/01/2017 và các văn bản hướng dẫn thi hành;',
    'Căn cứ Luật Thương mại 2005, có hiệu lực từ ngày 01/01/2006 và các văn bản hướng dẫn thi hành;',
    'Căn cứ Luật Du lịch 2017, có hiệu lực từ ngày 01/01/2018 và các văn bản hướng dẫn thi hành;',
    'Căn cứ vào nhu cầu và khả năng của hai bên.',
  ].forEach(b => writeLine('• ' + b, { size: 9, spaceAfter: 2 }));
  y += 4;

  setFont('normal'); pdf.setFontSize(10);
  pdf.text(`Hôm nay, ngày ${form.contractDate}, chúng tôi gồm có:`, mX, y); y += 8;

  // ── Bên A ──
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...teal);
  pdf.text('BÊN A: CÔNG TY TNHH DU LỊCH VÀ SỰ KIỆN VIỆT (VIETTOURS)', mX, y); y += 6;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  const sideARows: [string, string][] = [
    ['Địa chỉ:', '19B Mai Thị Lựu, Phường Tân Định, TP. Hồ Chí Minh'],
    ['Tel:', '(028) 38 218 218 – 38 217 217          Fax: (028) 38 218 999'],
    ['Đại diện bởi:', 'Ông HOÀNG ANH TUẤN     Chức vụ: Giám Đốc Điều Hành'],
    ['Số tài khoản:', '007.100.075.5134 (VND) tại Ngân hàng Vietcombank – TP. HCM'],
    ['Mã số thuế:', '0302650371'],
  ];
  sideARows.forEach(([k, v]) => {
    setFont('bold'); pdf.text(k, mX, y);
    setFont('normal'); pdf.text(v, mX + 30, y); y += 5;
  });
  y += 4;

  // ── Bên B ──
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...teal);
  pdf.text(`BÊN B: ${(form.partyB.name || '________________________').toUpperCase()}`, mX, y); y += 6;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  const sideBRows: [string, string][] = [
    ['Địa chỉ:', form.partyB.address || '_________________'],
    ['Tel:', form.partyB.tel || '_________________'],
    ['Đại diện bởi:', `${form.partyB.rep || '_______________'}     Chức vụ: ${form.partyB.title || '_______'}`],
    ['Mã số thuế:', form.partyB.taxCode || '_________________'],
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
  pdf.text('Sau khi thỏa thuận, hai bên đồng ý ký hợp đồng này với các điều khoản sau:', mX, y); y += 10;

  // ── Điều 1 ──
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('ĐIỀU 1: NỘI DUNG CHI TIẾT', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(10); pdf.setTextColor(...dark);
  writeLine(
    `Bên B đồng ý chọn Bên A tổ chức Chương trình tại ${form.tourDest || '...'} cho đoàn ${form.contractPax} khách khởi hành từ ${form.departure} từ ngày ${form.tourStartDate ? fmtD(startD) : '___/___/______'} đến ngày ${form.tourStartDate ? fmtD(endD) : '___/___/______'}.`,
    { size: 10, spaceAfter: 6 },
  );

  setFont('bold'); pdf.setFontSize(10);
  pdf.text('Giá tour:', mX, y); y += 6;
  setFont('normal');
  pdf.setFillColor(245, 250, 248); pdf.setDrawColor(...teal); pdf.setLineWidth(0.3);
  pdf.roundedRect(mX, y - 3, contentW, 12, 2, 2, 'FD');
  setFont('bold'); pdf.setTextColor(...dark); pdf.setFontSize(10);
  pdf.text(
    `${fmtV(form.pricePerPax)} ₫/khách  ×  ${form.contractPax} khách  =  ${fmtV(totalAmount)} ₫`,
    pageW / 2, y + 4, { align: 'center' },
  );
  y += 14;
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...red);
  pdf.text(`Tổng giá trị HĐ (đã bao gồm VAT): ${fmtV(totalAmount)} ₫`, mX, y); y += 6;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...gray);
  writeLine(`(Bằng chữ: ${numberToVietWords(totalAmount)} đồng.)`, { size: 9.5, color: gray, spaceAfter: 6 });

  // ── Includes / Excludes ──
  checkPage(25);
  setFont('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...teal);
  pdf.text('Bao gồm:', mX, y); y += 5;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  (form.includes || []).forEach(it => { if (it.trim()) writeLine('• ' + it, { size: 9.5, indent: 4, spaceAfter: 1.5, maxW: contentW - 8 }); });
  y += 3;

  checkPage(25);
  setFont('bold'); pdf.setFontSize(10.5); pdf.setTextColor(...red);
  pdf.text('Không bao gồm:', mX, y); y += 5;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  (form.excludes || []).forEach(it => { if (it.trim()) writeLine('• ' + it, { size: 9.5, indent: 4, spaceAfter: 1.5, maxW: contentW - 8 }); });
  y += 6;

  // ── Điều 2: Bên A ──
  checkPage(40);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('ĐIỀU 2: TRÁCH NHIỆM BÊN A', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  [
    'Trong trường hợp vì lý do thời tiết hay các lý do khác có thể xảy ra, dẫn đến việc không thể thực hiện được một phần chương trình tham quan, Bên A có thể thay thế bằng các chương trình tương đương với sự đồng ý của Bên B.',
    'Cam kết thực hiện đúng các tuyến điểm tham quan, khách sạn và nhà hàng như chương trình đã báo cho Bên B.',
    'Bên A đảm bảo các dịch vụ đi kèm chuyến đi như ăn uống, di chuyển, khách sạn phải đạt tiêu chuẩn về an toàn, vệ sinh thực phẩm.',
    'Chuẩn bị các điều kiện về ăn ở, đi lại, hướng dẫn viên, chương trình tham quan theo đúng như thỏa thuận ban đầu với Bên B.',
    'Mua bảo hiểm du lịch cho khách hàng theo thỏa thuận.',
    'Thông báo ngay cho Bên B trong trường hợp thông tin không đầy đủ để thực hiện công việc.',
    'Các trách nhiệm khác theo Hợp đồng này và theo quy định pháp luật.',
  ].forEach(r => writeLine('• ' + r, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  y += 4;

  // ── Điều 3: Bên B ──
  checkPage(30);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('ĐIỀU 3: TRÁCH NHIỆM BÊN B', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  [
    'Cung cấp cho Bên A danh sách đoàn với đầy đủ thông tin cá nhân, số điện thoại và toàn bộ hộ chiếu của khách.',
    'Bảo đảm khách phải có hộ chiếu hợp lệ (Hộ chiếu phải còn thời hạn sử dụng trước thời gian khởi hành trên 6 tháng).',
    'Trong thời gian tham dự chuyến đi, các thành viên Bên B phải tuân thủ theo chương trình.',
    'Thanh toán đúng theo quy định tại Điều 1 và Điều 4 của Hợp đồng.',
    'Các quyền và nghĩa vụ khác theo quy định của pháp luật.',
  ].forEach(r => writeLine('• ' + r, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  y += 4;

  // ── Điều 4: Thanh toán ──
  checkPage(30);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('ĐIỀU 4: THANH TOÁN', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  pdf.text(`Việc thanh toán được tiến hành theo ${(form.payments || []).length} đợt bằng hình thức chuyển khoản qua ngân hàng:`, mX, y); y += 6;
  (form.payments || []).forEach((p, i) => {
    const amt = p.percent !== undefined
      ? Math.round(totalAmount * (p.percent / 100))
      : (p.amount || 0);
    const pct = p.percent ?? (totalAmount > 0 ? +((p.amount / totalAmount) * 100).toFixed(2) : 0);
    setFont('bold'); pdf.setFontSize(9.5); pdf.setTextColor(...teal);
    pdf.text(`Đợt ${i + 1}:`, mX + 4, y);
    setFont('normal'); pdf.setTextColor(...dark);
    const txt2 = `${p.label} – Thanh toán ${pct}% giá trị HĐ, tương đương ${fmtV(amt)} ₫${p.note ? '. ' + p.note : ''}.`;
    const lines: string[] = pdf.splitTextToSize(txt2, contentW - 22);
    pdf.text(lines, mX + 18, y);
    y += Math.max(5, lines.length * 4.5) + 2;
    checkPage(10);
  });
  y += 4;

  // ── Điều 5: Phạt hủy ──
  checkPage(35);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('ĐIỀU 5: PHẠT HỦY', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  writeLine('Trường hợp khách không thể tham dự chuyến đi, Bên B phải thanh toán các chi phí phạt hủy:', { size: 9.5, spaceAfter: 4 });
  (form.cancels || []).forEach(c => writeLine(`• ${c.when}: ${c.penalty}% giá trọn gói cho 01 khách tính trên số lượng khách hủy.`, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  writeLine(`• Trong trường hợp một (01) bên vi phạm nghĩa vụ đã thỏa thuận trong hợp đồng thì phải bồi thường cho bên bị vi phạm ${form.bondPercent}% giá trị phần nghĩa vụ hợp đồng bị vi phạm.`, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 });
  y += 4;

  // ── Điều 6 ──
  checkPage(50);
  setFont('bold'); pdf.setFontSize(12); pdf.setTextColor(...teal);
  pdf.text('ĐIỀU 6: CÁC ĐIỀU KHOẢN CHUNG', mX, y); y += 7;
  setFont('normal'); pdf.setFontSize(9.5); pdf.setTextColor(...dark);
  [
    'Bên A sẽ không chịu trách nhiệm cho các chuyến bay bị đình hoãn do thời tiết, chiến tranh, khủng bố, đình công, thiên tai, hỏa hoạn.',
    'Nếu có sự cố xảy ra trong quá trình đi tour, Bên B ủy quyền toàn bộ cho Bên A để liên lạc, chuẩn bị hồ sơ bồi thường và nhận tiền bồi thường bảo hiểm cho khách.',
    'Trong trường hợp Hợp Đồng không thể thực hiện được do Sự Kiện Bất Khả Kháng, hai bên sẽ cùng thương lượng để tìm ra hướng giải quyết.',
    'Trong quá trình thực hiện thỏa thuận, hai Bên có thể tiến hành sửa đổi và bổ sung một số điều khoản trong thỏa thuận này với điều kiện là việc sửa đổi phải lập thành văn bản.',
    'Hợp đồng này được lập thành 02 (hai) bản bằng tiếng Việt, mỗi Bên giữ 01 (một) bản có giá trị ngang nhau và có hiệu lực kể từ ngày ký.',
  ].forEach(g => writeLine('• ' + g, { size: 9.5, indent: 4, spaceAfter: 2.5, maxW: contentW - 8 }));
  y += 10;

  // ── Ký tên ──
  checkPage(50);
  const sigW = contentW / 2;
  setFont('bold'); pdf.setFontSize(11); pdf.setTextColor(...dark);
  pdf.text('ĐẠI DIỆN BÊN B', mX + sigW / 2, y, { align: 'center' });
  pdf.text('ĐẠI DIỆN BÊN A', mX + sigW + sigW / 2, y, { align: 'center' });
  y += 5;
  setFont('normal'); pdf.setFontSize(9); pdf.setTextColor(...gray);
  pdf.text('(Ký và đóng dấu)', mX + sigW / 2, y, { align: 'center' });
  pdf.text('(Ký và đóng dấu)', mX + sigW + sigW / 2, y, { align: 'center' });
  y += 30;
  setFont('bold'); pdf.setFontSize(10); pdf.setTextColor(...dark);
  pdf.text((form.partyB.rep || '_______________').toUpperCase(), mX + sigW / 2, y, { align: 'center' });
  pdf.text('Ông HOÀNG ANH TUẤN', mX + sigW + sigW / 2, y, { align: 'center' });
  y += 5;
  setFont('normal'); pdf.setFontSize(9); pdf.setTextColor(...gray);
  pdf.text(`(${form.partyB.title || 'Giám đốc'})`, mX + sigW / 2, y, { align: 'center' });
  pdf.text('(Giám Đốc Điều Hành)', mX + sigW + sigW / 2, y, { align: 'center' });

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
  return { pdf, filename: `HopDong_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf` };
}

/** Tải hợp đồng PDF về máy. */
export function exportContractPDF(contract: Contract): void {
  const { pdf, filename } = buildContractPDF(contract);
  pdf.save(filename);
}

/** Tạo PDF hợp đồng dưới dạng blob URL (để xem trước trong app). Nhớ revoke khi đóng. */
export function contractPDFObjectURL(contract: Contract): { url: string; filename: string } {
  const { pdf, filename } = buildContractPDF(contract);
  return { url: URL.createObjectURL(pdf.output('blob')), filename };
}
