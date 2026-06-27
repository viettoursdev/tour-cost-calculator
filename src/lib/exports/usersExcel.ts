/**
 * Xuất / nhập DANH SÁCH TÀI KHOẢN người dùng ra/từ .xlsx — để CEO/BGĐ chỉnh
 * hàng loạt chức vụ (role) và phòng ban (department) cho từng thành viên rồi
 * nạp lại. Dùng ExcelJS + file-saver như các bản xuất khác.
 *
 * Quy ước AN TOÀN: nhập file là UPSERT theo `username` — chỉ THÊM mới hoặc CẬP
 * NHẬT tài khoản trùng username; KHÔNG bao giờ xoá tài khoản vắng mặt trong file.
 *
 * Cột nhận diện theo TÊN tiêu đề (đã normalizeVN) nên thứ tự cột linh hoạt; file
 * do chính chức năng "Xuất Excel" tạo ra luôn nhập lại được.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { normalizeVN } from '@/lib/search';
import { BRAND_TEAL_ARGB } from './brand';
import { ROLES, USER_COLORS } from '@/auth/ROLES';
import { DEPARTMENTS, DEPT_LABEL } from '@/auth/departments';
import type { Department, Role, User } from '@/types';

const EMAIL_DOMAIN = '@viettours.com.vn';

const HEADERS = [
  'Username', 'Tên hiển thị', 'Email công ty', 'Số điện thoại', 'Chức vụ', 'Phòng ban', 'Màu',
];

// Bí danh tiêu đề → khoá nội bộ. Khoá đã normalizeVN (bỏ dấu, lowercase).
const HEADER_MAP: Record<string, 'u' | 'name' | 'email' | 'phone' | 'role' | 'department' | 'color'> = {
  'username': 'u', 'ten dang nhap': 'u', 'tk': 'u', 'tai khoan': 'u',
  'ten hien thi': 'name', 'ho ten': 'name', 'ten': 'name',
  'email cong ty': 'email', 'email': 'email',
  'so dien thoai': 'phone', 'dien thoai': 'phone', 'sdt': 'phone', 'phone': 'phone',
  'chuc vu': 'role', 'vai tro': 'role', 'role': 'role',
  'phong ban': 'department', 'phong': 'department', 'department': 'department',
  'mau': 'color', 'mau nhan dien': 'color', 'color': 'color',
};

// Tra ngược nhãn → giá trị chuẩn (chấp nhận cả nhập bằng id lẫn nhãn tiếng Việt).
const ROLE_BY_NORM: Record<string, Role> = Object.fromEntries(
  ROLES.map((r) => [normalizeVN(r), r]),
) as Record<string, Role>;

const DEPT_BY_NORM: Record<string, Department> = {};
for (const d of DEPARTMENTS) {
  DEPT_BY_NORM[normalizeVN(d.id)] = d.id;
  DEPT_BY_NORM[normalizeVN(d.label)] = d.id;
}

function cellText(ws: ExcelJS.Worksheet, r: number, c: number): string {
  const v = ws.getCell(r, c).value;
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string; hyperlink?: string };
    if (o.text != null) return String(o.text);
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}

export type UsersImportResult = {
  /** Danh sách user đầy đủ ĐÃ hợp nhất, sẵn sàng để lưu (saveUsers). */
  next: User[];
  added: number;
  updated: number;
  /** Lỗi theo từng dòng (không chặn các dòng hợp lệ khác). */
  errors: string[];
};

/**
 * Đọc file Excel → hợp nhất (upsert theo username) vào danh sách hiện có.
 * KHÔNG xoá tài khoản nào không xuất hiện trong file.
 */
export async function parseUsersExcel(file: File, existing: readonly User[]): Promise<UsersImportResult> {
  const buf = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('File Excel rỗng.');

  // Tìm hàng tiêu đề trong 10 hàng đầu (hàng có ≥2 ô khớp HEADER_MAP, bắt buộc có cột Username).
  let headerRow = 0;
  const colMap: Record<number, (typeof HEADER_MAP)[string]> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const found: Record<number, (typeof HEADER_MAP)[string]> = {};
    for (let c = 1; c <= Math.min(40, ws.columnCount || 40); c++) {
      const key = normalizeVN(cellText(ws, r, c));
      if (HEADER_MAP[key]) found[c] = HEADER_MAP[key];
    }
    const hasUser = Object.values(found).includes('u');
    if (Object.keys(found).length >= 2 && hasUser) { headerRow = r; Object.assign(colMap, found); break; }
  }
  if (!headerRow) {
    throw new Error('Không tìm thấy hàng tiêu đề hợp lệ. Hãy dùng "Xuất Excel" để lấy đúng định dạng (cần ít nhất cột Username và một cột khác).');
  }

  // Bản đồ username → user (sao chép để không đụng state gốc).
  const byUser = new Map<string, User>();
  existing.forEach((u) => byUser.set(u.u.toLowerCase(), { ...u }));
  const startCount = byUser.size;

  const errors: string[] = [];
  const seenEmail = new Map<string, string>(); // email → username (phát hiện trùng trong file + hiện có)
  existing.forEach((u) => { if (u.email) seenEmail.set(u.email.toLowerCase(), u.u.toLowerCase()); });
  let colorCursor = startCount;
  let updated = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const raw: Record<string, string> = {};
    for (const [cStr, field] of Object.entries(colMap)) {
      raw[field] = cellText(ws, r, Number(cStr)).trim();
    }
    // Bỏ dòng trống hoàn toàn.
    if (!Object.values(raw).some((v) => v)) continue;

    const username = (raw.u || '').toLowerCase();
    if (!username) { errors.push(`Dòng ${r}: thiếu Username — bỏ qua.`); continue; }

    const name = (raw.name || '').trim();
    const email = (raw.email || '').trim().toLowerCase();
    const phone = (raw.phone || '').trim();

    // Chức vụ.
    let role: Role | undefined;
    if (raw.role) {
      role = ROLE_BY_NORM[normalizeVN(raw.role)];
      if (!role) { errors.push(`Dòng ${r} (@${username}): chức vụ "${raw.role}" không hợp lệ — bỏ qua dòng.`); continue; }
    }
    // Phòng ban (rỗng = chưa gán / toàn quyền).
    let department: Department | undefined;
    let clearDept = false;
    if (raw.department) {
      const norm = normalizeVN(raw.department);
      if (norm === '' || norm === '-' || norm === 'chua gan' || norm === 'toan quyen') {
        clearDept = true;
      } else {
        department = DEPT_BY_NORM[norm];
        if (!department) { errors.push(`Dòng ${r} (@${username}): phòng ban "${raw.department}" không hợp lệ — bỏ qua dòng.`); continue; }
      }
    }

    const existingUser = byUser.get(username);

    // Email: bắt buộc & đúng tên miền cho tài khoản MỚI; với tài khoản cũ chỉ kiểm khi có nhập.
    if (email) {
      if (!email.endsWith(EMAIL_DOMAIN)) {
        errors.push(`Dòng ${r} (@${username}): email phải kết thúc bằng ${EMAIL_DOMAIN} — bỏ qua dòng.`);
        continue;
      }
      const owner = seenEmail.get(email);
      if (owner && owner !== username) {
        errors.push(`Dòng ${r} (@${username}): email ${email} đã dùng cho @${owner} — bỏ qua dòng.`);
        continue;
      }
    }

    if (existingUser) {
      // CẬP NHẬT — chỉ ghi các trường có giá trị (ô trống = giữ nguyên), trừ phòng ban có thể xoá rõ ràng.
      const before = JSON.stringify(existingUser);
      if (name) existingUser.name = name;
      if (email) { existingUser.email = email; seenEmail.set(email, username); }
      if (phone) existingUser.phone = phone;
      if (role) existingUser.role = role;
      if (department) existingUser.department = department;
      else if (clearDept) delete existingUser.department;
      if (JSON.stringify(existingUser) !== before) updated++;
    } else {
      // THÊM MỚI — yêu cầu đủ tên + email hợp lệ.
      if (!name) { errors.push(`Dòng ${r} (@${username}): tài khoản mới cần Tên hiển thị — bỏ qua.`); continue; }
      if (!email) { errors.push(`Dòng ${r} (@${username}): tài khoản mới cần Email công ty — bỏ qua.`); continue; }
      const color = (raw.color && /^#?[0-9a-fA-F]{6}$/.test(raw.color))
        ? (raw.color.startsWith('#') ? raw.color : `#${raw.color}`)
        : USER_COLORS[colorCursor % USER_COLORS.length];
      colorCursor++;
      const newUser: User = {
        u: username,
        email,
        ...(phone ? { phone } : {}),
        p: '',
        role: role ?? 'Standard',
        ...(department ? { department } : {}),
        name,
        color,
      };
      byUser.set(username, newUser);
      seenEmail.set(email, username);
    }
  }

  const next = Array.from(byUser.values());
  return { next, added: byUser.size - startCount, updated, errors };
}

/** Xuất danh sách tài khoản hiện tại ra .xlsx (đẹp + có dropdown chọn chức vụ / phòng ban). */
export async function exportUsersExcel(users: readonly User[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Viettours';
  wb.created = new Date();

  const ws = wb.addWorksheet('Tài khoản', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { width: 18 }, { width: 24 }, { width: 32 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 12 },
  ];

  // Hàng tiêu đề.
  const head = ws.addRow(HEADERS);
  head.height = 22;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_TEAL_ARGB } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Dữ liệu.
  users.forEach((u) => {
    ws.addRow([
      u.u,
      u.name,
      u.email ?? '',
      u.phone ?? '',
      u.role,
      u.department ? DEPT_LABEL[u.department] : '',
      u.color ?? '',
    ]);
  });

  // Dropdown validation cho cột Chức vụ (E) và Phòng ban (F) — chỉnh tay dễ, ít sai.
  const roleList = `"${ROLES.join(',')}"`;
  const deptList = `"${DEPARTMENTS.map((d) => d.label).join(',')}"`;
  const lastRow = ws.rowCount;
  for (let r = 2; r <= lastRow + 50; r++) {
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [roleList] };
    ws.getCell(`F${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [deptList] };
  }

  // Sheet hướng dẫn — liệt kê giá trị hợp lệ.
  const guide = wb.addWorksheet('Hướng dẫn');
  guide.columns = [{ width: 28 }, { width: 40 }];
  guide.addRow(['HƯỚNG DẪN NHẬP LẠI']).font = { bold: true, size: 13 };
  guide.addRow([]);
  guide.addRow(['• Khoá đối chiếu là cột Username — sửa Chức vụ / Phòng ban rồi nhập lại.']);
  guide.addRow(['• Nhập file chỉ THÊM mới hoặc CẬP NHẬT; KHÔNG xoá tài khoản nào.']);
  guide.addRow(['• Ô Phòng ban để TRỐNG = chưa gán phòng (toàn quyền theo cấp bậc).']);
  guide.addRow([]);
  guide.addRow(['Chức vụ hợp lệ', 'Phòng ban hợp lệ']).font = { bold: true };
  const maxLen = Math.max(ROLES.length, DEPARTMENTS.length);
  for (let i = 0; i < maxLen; i++) {
    guide.addRow([ROLES[i] ?? '', DEPARTMENTS[i]?.label ?? '']);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const stamp = new Date().toISOString().slice(0, 10);
  saveAs(blob, `TaiKhoan_Viettours_${stamp}.xlsx`);
}
