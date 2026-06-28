import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickFiles } from './pickFiles';

/**
 * jsdom KHÔNG mở được hộp thoại chọn file thật, nên ta giả lập bằng cách chặn
 * HTMLInputElement.click() (no-op) rồi tự bắn sự kiện như trình duyệt sẽ làm. Phần
 * được kiểm: input động được gắn vào body với đúng accept/multiple, resolve khi
 * 'change', resolve rỗng khi người dùng huỷ (chỉ có 'focus' trở lại window), và dọn
 * dẹp input sau khi xong.
 */
describe('pickFiles', () => {
  let captured: HTMLInputElement | undefined;

  beforeEach(() => {
    captured = undefined;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const orig = HTMLElement.prototype.appendChild;
    vi.spyOn(document.body, 'appendChild').mockImplementation(function (node) {
      if (node instanceof HTMLInputElement) captured = node;
      return orig.call(document.body, node);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('cấu hình input (accept/multiple) và gắn vào document.body khi click', () => {
    void pickFiles({ accept: '.pdf,image/*', multiple: true });

    expect(captured).toBeDefined();
    expect(captured!.type).toBe('file');
    expect(captured!.accept).toBe('.pdf,image/*');
    expect(captured!.multiple).toBe(true);
    expect(document.body.contains(captured!)).toBe(true);
  });

  it('resolve danh sách file khi có sự kiện change, rồi gỡ input khỏi DOM', async () => {
    const p = pickFiles();
    const file = new File(['hello'], 'baogia.pdf', { type: 'application/pdf' });
    Object.defineProperty(captured!, 'files', { value: [file], configurable: true });
    captured!.dispatchEvent(new Event('change'));

    const result = await p;
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('baogia.pdf');
    expect(document.body.contains(captured!)).toBe(false);
  });

  it('resolve rỗng khi người dùng huỷ (chỉ có focus trở lại, không có change)', async () => {
    vi.useFakeTimers();

    const p = pickFiles();
    window.dispatchEvent(new Event('focus'));
    await vi.runAllTimersAsync();

    await expect(p).resolves.toEqual([]);
  });
});
