// Âm báo tin nhắn mới — tạo bằng WebAudio (không cần file asset, không phụ thuộc mạng).
// No-op an toàn nếu trình duyệt không hỗ trợ / autoplay bị chặn.

let ctx: AudioContext | null = null;

/** Phát một tiếng "ting" hai nốt ngắn, nhẹ nhàng khi có tin nhắn mới. */
export function playChatPing(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t0);          // A5
    o.frequency.setValueAtTime(1174.66, t0 + 0.08); // D6
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + 0.32);
  } catch {
    /* ignore — autoplay policy hoặc thiếu WebAudio */
  }
}
