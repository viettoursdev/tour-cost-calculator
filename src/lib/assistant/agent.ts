/**
 * Vòng lặp tool-use phía client cho Trợ lý ảo. Gửi lịch sử hội thoại + tool tới
 * worker `/chat`; khi Claude yêu cầu tool (custom) thì thực thi cục bộ rồi gửi
 * tool_result và lặp. `web_search` do API Anthropic tự xử lý (server tool).
 */
import { callAIWorker, type ChatMessage, type ContentBlock, type Citation } from '@/lib/aiWorker';
import { ASSISTANT_TOOLS, PROPOSAL_TOOLS, runAssistantTool } from './tools';
import { assistantSystem } from './prompt';

export interface AssistantProposal {
  kind: 'itinerary' | 'quote';
  payload: Record<string, unknown>;
}

export interface AssistantResult {
  text: string;
  citations: Citation[];
  proposals: AssistantProposal[];
  messages: ChatMessage[];
}

const MAX_TURNS = 8;

export async function runAssistant(
  history: ChatMessage[],
  opts: { web?: boolean; onActivity?: (label: string) => void } = {},
): Promise<AssistantResult> {
  const messages: ChatMessage[] = [...history];
  const citations: Citation[] = [];
  const proposals: AssistantProposal[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    opts.onActivity?.(turn === 0 ? 'Đang suy nghĩ…' : 'Đang phân tích…');
    const res = await callAIWorker('/chat', {
      system: assistantSystem(),
      messages,
      tools: ASSISTANT_TOOLS,
      web: !!opts.web,
    });
    const content = res.content ?? [];
    messages.push({ role: 'assistant', content });
    content.forEach((b) => { if (b.type === 'text' && b.citations) citations.push(...b.citations); });

    const toolUses = content.filter((b) => b.type === 'tool_use');
    // Kết thúc khi không còn tool custom cần chạy (web_search đã được API xử lý).
    if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const text = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
      return { text, citations, proposals, messages };
    }

    const results: ContentBlock[] = [];
    for (const tu of toolUses) {
      const tname = tu.name ?? '';
      const tinput = (tu.input ?? {}) as Record<string, unknown>;
      if (PROPOSAL_TOOLS.has(tname)) {
        proposals.push({ kind: tname === 'propose_quote' ? 'quote' : 'itinerary', payload: tinput });
      }
      opts.onActivity?.(`Tra cứu: ${tname}…`);
      const out = await runAssistantTool(tname, tinput);
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }

  return {
    text: '⚠ Trợ lý dừng vì vượt số bước phân tích cho phép. Hãy thử hỏi cụ thể hơn.',
    citations, proposals, messages,
  };
}
