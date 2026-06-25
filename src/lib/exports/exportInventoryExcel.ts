/**
 * Xuất Quản lý kho ra Excel (.xlsx): sheet Tồn kho (hàng tiêu hao theo màu/size) +
 * Tài sản (thiết bị từng cái) + Lịch sử nhập/xuất. ExcelJS, header brand teal.
 * Nạp động khi bấm (tránh kéo lib nặng).
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { BRAND_TEAL_ARGB } from './brand';
import type {
  InventoryCategory, InventoryItem, StockRow, InventoryAsset, InventoryMovement,
} from '@/types/inventory';

const FONT = 'Aptos';
const NAVY = 'FF0F3A4A', WHITE = 'FFFFFFFF', LINE = 'FFE4E8EB';

const STATUS_LABEL: Record<string, string> = {
  available: 'Sẵn sàng', in_use: 'Đang dùng', maintenance: 'Bảo trì', retired: 'Thanh lý', lost: 'Mất/Hỏng',
};
const TYPE_LABEL: Record<string, string> = { in: 'Nhập', out: 'Xuất', adjust: 'Điều chỉnh' };

function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number)[][]) {
  const ws = wb.addWorksheet(name, { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
  ws.addRow(headers);
  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  rows.forEach((r) => {
    const row = ws.addRow(r);
    row.eachCell((c) => {
      c.font = { name: FONT, size: 10, color: { argb: NAVY } };
      c.alignment = { vertical: 'middle', wrapText: true };
      c.border = { bottom: { style: 'thin', color: { argb: LINE } } };
    });
  });
  headers.forEach((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length));
    ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 42);
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

export async function exportInventoryExcel({
  categories, items, stock, assets, movements,
}: {
  categories: InventoryCategory[];
  items: InventoryItem[];
  stock: StockRow[];
  assets: InventoryAsset[];
  movements: InventoryMovement[];
}): Promise<void> {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const catName = (it?: InventoryItem) => (it ? (catById.get(it.categoryId)?.name ?? '') : '');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours Tour Cost Calculator';
  wb.created = new Date();

  // Tồn kho — mỗi dòng = một (sản phẩm × màu × size) còn tồn.
  addSheet(wb, 'Tồn kho',
    ['Mã SP', 'Sản phẩm', 'Loại', 'Màu', 'Size', 'Tồn', 'ĐVT', 'Giá trị (FIFO)'],
    stock
      .filter((s) => s.onHand > 0)
      .sort((a, b) => (itemById.get(a.itemId)?.code ?? '').localeCompare(itemById.get(b.itemId)?.code ?? ''))
      .map((s) => {
        const it = itemById.get(s.itemId);
        return [it?.code ?? '', it?.name ?? '', catName(it), s.color || '—', s.size || '—', s.onHand, it?.unit ?? '', Math.round(s.value)];
      }),
  );

  // Tài sản — mỗi dòng = một cái thiết bị.
  addSheet(wb, 'Tài sản',
    ['Mã', 'Model', 'Loại', 'Serial', 'Trạng thái', 'Người giữ', 'Vị trí', 'Tình trạng', 'Nguyên giá', 'Ngày mua'],
    assets
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => {
        const it = itemById.get(a.itemId);
        return [
          a.code, it?.name ?? '', catName(it), a.serial, STATUS_LABEL[a.status] ?? a.status,
          a.holder, a.location, a.condition, Math.round(a.purchaseCost), fmtDate(a.purchasedAt),
        ];
      }),
  );

  // Lịch sử nhập/xuất.
  addSheet(wb, 'Lịch sử',
    ['Thời gian', 'Loại', 'Mã SP', 'Sản phẩm', 'Màu', 'Size', 'Số lượng', 'Lý do', 'Tham chiếu', 'Người'],
    movements.map((m) => {
      const it = itemById.get(m.itemId);
      return [
        fmtDate(m.occurredAt), TYPE_LABEL[m.type] ?? m.type, it?.code ?? '', it?.name ?? '',
        m.color || '—', m.size || '—', (m.type === 'out' ? -m.qty : m.qty), m.reason, m.ref, m.createdBy,
      ];
    }),
  );

  const buf = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Kho-Viettours-${stamp}.xlsx`);
}
