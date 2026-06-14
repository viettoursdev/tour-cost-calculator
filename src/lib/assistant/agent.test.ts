import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/aiWorker', () => ({ callAIWorker: vi.fn() }));
vi.mock('./tools', () => ({
  ASSISTANT_TOOLS: [{ name: 'search_records', description: '', input_schema: {} }],
  runAssistantTool: vi.fn(),
}));

import { callAIWorker } from '@/lib/aiWorker';
import { runAssistantTool } from './tools';
import { runAssistant } from './agent';

const mockCall = vi.mocked(callAIWorker);
const mockTool = vi.mocked(runAssistantTool);

beforeEach(() => { mockCall.mockReset(); mockTool.mockReset(); });

describe('runAssistant', () => {
  it('runs a tool_use round then returns final text', async () => {
    mockCall
      .mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 't1', name: 'search_records', input: { query: 'x' } }], stop_reason: 'tool_use' })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'Tìm thấy 2 báo giá.' }], stop_reason: 'end_turn' });
    mockTool.mockResolvedValue('{"count":2}');

    const r = await runAssistant([{ role: 'user', content: 'tìm báo giá' }]);

    expect(mockCall).toHaveBeenCalledTimes(2);
    expect(mockTool).toHaveBeenCalledWith('search_records', { query: 'x' });
    expect(r.text).toBe('Tìm thấy 2 báo giá.');
  });

  it('returns immediately when no tool is requested', async () => {
    mockCall.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Chào bạn.' }], stop_reason: 'end_turn' });
    const r = await runAssistant([{ role: 'user', content: 'xin chào' }]);
    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(mockTool).not.toHaveBeenCalled();
    expect(r.text).toBe('Chào bạn.');
  });

  it('collects web citations from text blocks', async () => {
    mockCall.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Theo nguồn.', citations: [{ url: 'https://x.com', title: 'X' }] }],
      stop_reason: 'end_turn',
    });
    const r = await runAssistant([{ role: 'user', content: 'hỏi web' }], { web: true });
    expect(mockCall).toHaveBeenCalledWith('/chat', expect.objectContaining({ web: true }));
    expect(r.citations).toEqual([{ url: 'https://x.com', title: 'X' }]);
  });
});
