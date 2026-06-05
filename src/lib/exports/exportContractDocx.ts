/**
 * Export a Contract as a Word (.docx) file.
 * Source: public/legacy.html:6153-6344 (exportContractDocx).
 * Uses the `docx` npm package already in the bundle.
 */
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell,
  TableRow, TextRun, WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import { numberToVietWords } from './vietWords';
import type { Contract } from '@/types';

export async function exportContractDocx(contract: Contract): Promise<void> {
  const form = contract;
  const totalAmount = Math.round((+form.pricePerPax || 0) * (+form.contractPax || 0));
  const startD = form.tourStartDate ? new Date(form.tourStartDate) : new Date();
  const endD = new Date(startD.getTime() + ((form.tourDays || 1) - 1) * 86400000);

  const fmtV = (n: number) => Math.round(n).toLocaleString('vi-VN');
  const fmtD = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  // ── Helpers ──
  const P = (text: string, opts: {
    bold?: boolean; size?: number; color?: string; italics?: boolean;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; indent?: number;
  } = {}) => new Paragraph({
    children: [new TextRun({ text: text || '', bold: !!opts.bold, size: opts.size || 22, color: opts.color || '0F3A4A', italics: !!opts.italics })],
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 60 },
    indent: opts.indent ? { left: opts.indent } : undefined,
  });

  const Mixed = (runs: Array<{ text: string; bold?: boolean; size?: number; color?: string; italics?: boolean }>,
    opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; indent?: number } = {}) =>
    new Paragraph({
      children: runs.map(r => new TextRun({ text: r.text, bold: r.bold, size: r.size || 22, color: r.color || '0F3A4A', italics: r.italics })),
      alignment: opts.align || AlignmentType.LEFT,
      spacing: { before: opts.before || 0, after: opts.after || 60 },
      indent: opts.indent ? { left: opts.indent } : undefined,
    });

  const Bullet = (text: string, size = 20) => new Paragraph({
    children: [new TextRun({ text: '• ' + text, size, color: '0F3A4A' })],
    spacing: { after: 80 },
    indent: { left: 360 },
  });

  const Heading = (text: string) => new Paragraph({
    children: [new TextRun({ text, bold: true, size: 26, color: '14A08C' })],
    spacing: { before: 300, after: 160 },
  });

  const children: Paragraph[] = [];

  // ── State header ──
  children.push(P('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, size: 24, align: AlignmentType.CENTER }));
  children.push(P('Độc lập – Tự do – Hạnh phúc', { bold: true, size: 24, align: AlignmentType.CENTER }));
  children.push(P('---o0o---', { align: AlignmentType.CENTER, after: 200 }));

  // ── Title ──
  children.push(P('HỢP ĐỒNG CUNG CẤP DỊCH VỤ', { bold: true, size: 36, color: '14A08C', align: AlignmentType.CENTER, before: 200 }));
  children.push(P(`(HĐ Số: ${form.contractNo || '_______/HĐ-VTE'})`, { italics: true, size: 22, color: '707880', align: AlignmentType.CENTER, after: 300 }));

  // ── Legal bases ──
  children.push(Bullet('Căn cứ Bộ luật Dân sự 2015, có hiệu lực từ ngày 01/01/2017 và các văn bản hướng dẫn thi hành;'));
  children.push(Bullet('Căn cứ Luật Thương mại 2005, có hiệu lực từ ngày 01/01/2006 và các văn bản hướng dẫn thi hành;'));
  children.push(Bullet('Căn cứ Luật Du lịch 2017, có hiệu lực từ ngày 01/01/2018 và các văn bản hướng dẫn thi hành;'));
  children.push(Bullet('Căn cứ vào nhu cầu và khả năng của hai bên.'));

  children.push(P(`Hôm nay, ngày ${form.contractDate}, chúng tôi gồm có:`, { before: 200, after: 160 }));

  // ── Bên A ──
  children.push(P('BÊN A: CÔNG TY TNHH DU LỊCH VÀ SỰ KIỆN VIỆT (VIETTOURS)', { bold: true, size: 24, color: '14A08C', before: 120, after: 120 }));
  ([
    ['Địa chỉ:', '19B Mai Thị Lựu, Phường Tân Định, TP. Hồ Chí Minh'],
    ['Tel:', '(028) 38 218 218 – 38 217 217          Fax: (028) 38 218 999'],
    ['Đại diện bởi:', 'Ông HOÀNG ANH TUẤN    Chức vụ: Giám Đốc Điều Hành'],
    ['Số tài khoản:', '007.100.075.5134 (VND) tại Vietcombank – TP. HCM'],
    ['Mã số thuế:', '0302650371'],
  ] as [string, string][]).forEach(([k, v]) => children.push(Mixed([{ text: k + ' ', bold: true }, { text: v }])));

  // ── Bên B ──
  children.push(P(`BÊN B: ${(form.partyB.name || '________________________').toUpperCase()}`, { bold: true, size: 24, color: '14A08C', before: 200, after: 120 }));
  ([
    ['Địa chỉ:', form.partyB.address || '_________________'],
    ['Tel:', form.partyB.tel || '_________________'],
    ['Đại diện bởi:', `${form.partyB.rep || '_______________'}    Chức vụ: ${form.partyB.title || '_______'}`],
    ['Mã số thuế:', form.partyB.taxCode || '_________________'],
    ['Email:', form.partyB.email || '_________________'],
  ] as [string, string][]).forEach(([k, v]) => children.push(Mixed([{ text: k + ' ', bold: true }, { text: v }])));

  children.push(P('Sau khi thỏa thuận, hai bên đồng ý ký hợp đồng này với các điều khoản sau:', { before: 200, after: 120 }));

  // ── Điều 1 ──
  children.push(Heading('ĐIỀU 1: NỘI DUNG CHI TIẾT'));
  children.push(P(`Bên B đồng ý chọn Bên A tổ chức Chương trình tại ${form.tourDest || '...'} cho đoàn ${form.contractPax} khách khởi hành từ ${form.departure} từ ngày ${form.tourStartDate ? fmtD(startD) : '___/___/______'} đến ngày ${form.tourStartDate ? fmtD(endD) : '___/___/______'}.`));

  children.push(P('Giá tour:', { bold: true, before: 120 }));
  children.push(P(`${fmtV(form.pricePerPax)} VNĐ/khách  ×  ${form.contractPax} khách  =  ${fmtV(totalAmount)} VNĐ`, { bold: true, align: AlignmentType.CENTER, size: 24 }));
  children.push(P(`Tổng giá trị HĐ (đã bao gồm VAT): ${fmtV(totalAmount)} VNĐ`, { bold: true, color: 'DC3250', size: 24, before: 120 }));
  children.push(P(`(Bằng chữ: ${numberToVietWords(totalAmount)} đồng.)`, { italics: true, color: '707880', size: 20, after: 200 }));

  children.push(P('Bao gồm:', { bold: true, color: '14A08C', before: 120, after: 80 }));
  (form.includes || []).forEach(it => { if (it.trim()) children.push(Bullet(it)); });

  children.push(P('Không bao gồm:', { bold: true, color: 'DC3250', before: 160, after: 80 }));
  (form.excludes || []).forEach(it => { if (it.trim()) children.push(Bullet(it)); });

  // ── Điều 2 ──
  children.push(Heading('ĐIỀU 2: TRÁCH NHIỆM BÊN A'));
  [
    'Trong trường hợp vì lý do thời tiết hay các lý do khác có thể xảy ra, dẫn đến việc không thể thực hiện được một phần chương trình tham quan, Bên A có thể thay thế bằng các chương trình tương đương với sự đồng ý của Bên B.',
    'Cam kết thực hiện đúng các tuyến điểm tham quan, khách sạn và nhà hàng như chương trình đã báo cho Bên B.',
    'Bên A đảm bảo các dịch vụ đi kèm chuyến đi như ăn uống, di chuyển, khách sạn phải đạt tiêu chuẩn về an toàn, vệ sinh thực phẩm.',
    'Chuẩn bị các điều kiện về ăn ở, đi lại, hướng dẫn viên, chương trình tham quan theo đúng như thỏa thuận ban đầu với Bên B.',
    'Mua bảo hiểm du lịch cho khách hàng theo thỏa thuận.',
    'Thông báo ngay cho Bên B trong trường hợp thông tin không đầy đủ để thực hiện công việc.',
    'Các trách nhiệm khác theo Hợp đồng này và theo quy định pháp luật.',
  ].forEach(r => children.push(Bullet(r)));

  // ── Điều 3 ──
  children.push(Heading('ĐIỀU 3: TRÁCH NHIỆM BÊN B'));
  [
    'Cung cấp cho Bên A danh sách đoàn với đầy đủ thông tin cá nhân, số điện thoại và toàn bộ hộ chiếu của khách.',
    'Bảo đảm khách phải có hộ chiếu hợp lệ (Hộ chiếu phải còn thời hạn sử dụng trước thời gian khởi hành trên 6 tháng).',
    'Trong thời gian tham dự chuyến đi, các thành viên Bên B phải tuân thủ theo chương trình.',
    'Thanh toán đúng theo quy định tại Điều 1 và Điều 4 của Hợp đồng.',
    'Các quyền và nghĩa vụ khác theo quy định của pháp luật.',
  ].forEach(r => children.push(Bullet(r)));

  // ── Điều 4 ──
  children.push(Heading('ĐIỀU 4: THANH TOÁN'));
  children.push(P(`Việc thanh toán được tiến hành theo ${(form.payments || []).length} đợt bằng hình thức chuyển khoản qua ngân hàng:`, { after: 120 }));
  (form.payments || []).forEach((p, i) => {
    const amt = p.percent !== undefined ? Math.round(totalAmount * p.percent / 100) : (p.amount || 0);
    const pct = p.percent ?? (totalAmount > 0 ? +((p.amount / totalAmount) * 100).toFixed(2) : 0);
    children.push(Mixed([
      { text: `Đợt ${i + 1}: `, bold: true, color: '14A08C' },
      { text: `${p.label} – Thanh toán ${pct}% giá trị HĐ, tương đương ${fmtV(amt)} VNĐ${p.note ? '. ' + p.note : ''}.` },
    ], { indent: 360 }));
  });

  // ── Điều 5 ──
  children.push(Heading('ĐIỀU 5: PHẠT HỦY'));
  children.push(P('Trường hợp khách không thể tham dự chuyến đi, Bên B phải thanh toán các chi phí phạt hủy:', { after: 120 }));
  (form.cancels || []).forEach(c => children.push(Bullet(`${c.when}: ${c.penalty}% giá trọn gói cho 01 khách tính trên số lượng khách hủy.`)));
  children.push(Bullet('Bên A không chịu trách nhiệm trong trường hợp khách bị lãnh sự quán từ chối cấp visa nhập cảnh.'));
  children.push(Bullet(`Trong trường hợp một (01) bên vi phạm nghĩa vụ đã thỏa thuận trong hợp đồng thì phải bồi thường cho bên bị vi phạm ${form.bondPercent}% giá trị phần nghĩa vụ hợp đồng bị vi phạm.`));

  // ── Điều 6 ──
  children.push(Heading('ĐIỀU 6: CÁC ĐIỀU KHOẢN CHUNG'));
  [
    'Bên A sẽ không chịu trách nhiệm cho các chuyến bay bị đình hoãn do thời tiết, chiến tranh, khủng bố, đình công, thiên tai, hỏa hoạn.',
    'Nếu có sự cố xảy ra trong quá trình đi tour, Bên B ủy quyền toàn bộ cho Bên A để liên lạc, chuẩn bị hồ sơ bồi thường và nhận tiền bồi thường bảo hiểm cho khách.',
    'Trong trường hợp Hợp Đồng không thể thực hiện được do Sự Kiện Bất Khả Kháng, hai bên sẽ cùng thương lượng để tìm ra hướng giải quyết.',
    'Trong quá trình thực hiện thỏa thuận, hai Bên có thể tiến hành sửa đổi và bổ sung một số điều khoản với điều kiện việc sửa đổi phải lập thành văn bản.',
    'Các Bên cam kết nghiêm túc tuân thủ và thực hiện theo đúng quy định Hợp đồng.',
    'Hợp đồng này được lập thành 02 (hai) bản bằng tiếng Việt, mỗi Bên giữ 01 (một) bản có giá trị ngang nhau và có hiệu lực kể từ ngày ký.',
  ].forEach(g => children.push(Bullet(g)));

  // ── Signatures (Table layout) ──
  children.push(P(' ', { before: 400 }));
  const sigTable = new Table({
    width: { size: 9026, type: WidthType.DXA },
    columnWidths: [4513, 4513],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 4513, type: WidthType.DXA },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ĐẠI DIỆN BÊN B', bold: true, size: 24 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '(Ký và đóng dấu)', italics: true, size: 18, color: '707880' })] }),
              new Paragraph({ children: [new TextRun({ text: ' ', size: 24 })] }),
              new Paragraph({ children: [new TextRun({ text: ' ', size: 24 })] }),
              new Paragraph({ children: [new TextRun({ text: ' ', size: 24 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: (form.partyB.rep || '_______________').toUpperCase(), bold: true, size: 22 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `(${form.partyB.title || 'Giám đốc'})`, italics: true, size: 18, color: '707880' })] }),
            ],
          }),
          new TableCell({
            width: { size: 4513, type: WidthType.DXA },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ĐẠI DIỆN BÊN A', bold: true, size: 24 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '(Ký và đóng dấu)', italics: true, size: 18, color: '707880' })] }),
              new Paragraph({ children: [new TextRun({ text: ' ', size: 24 })] }),
              new Paragraph({ children: [new TextRun({ text: ' ', size: 24 })] }),
              new Paragraph({ children: [new TextRun({ text: ' ', size: 24 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Ông HOÀNG ANH TUẤN', bold: true, size: 22 })] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '(Giám Đốc Điều Hành)', italics: true, size: 18, color: '707880' })] }),
            ],
          }),
        ],
      }),
    ],
  });
  children.push(sigTable as unknown as Paragraph);

  // ── Generate & save ──
  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 22 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = (form.partyB.name || form.tourName || 'HD').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  saveAs(blob, `HopDong_${safeName}_${new Date().toISOString().slice(0, 10)}.docx`);
}
