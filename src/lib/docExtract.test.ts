import { describe, it, expect, vi } from 'vitest';
import { chunkText } from './docExtract';

// Mock pdfjs-dist and worker imports since they require binary dependencies
// that don't load in vitest's jsdom environment.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(),
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '',
}));

vi.mock('./aiWorker', () => ({
  callAIWorker: vi.fn(),
}));

vi.mock('mammoth', () => ({
  default: {},
}));

describe('chunkText', () => {
  it('returns the original text as a single chunk when shorter than max', () => {
    expect(chunkText('hello world', 100)).toEqual(['hello world']);
  });

  it('splits at paragraph boundaries (\\n\\n) when over max', () => {
    const text = 'aaa\n\nbbb\n\nccc';
    const out = chunkText(text, 5);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) {
      expect(c.length).toBeLessThanOrEqual(10);
    }
  });

  it('hard-splits a single paragraph longer than max', () => {
    const text = 'a'.repeat(25);
    const out = chunkText(text, 10);
    expect(out.length).toBe(3);
    expect(out[0].length).toBe(10);
    expect(out[1].length).toBe(10);
    expect(out[2].length).toBe(5);
  });

  it('returns [text] when input is empty or whitespace-only', () => {
    expect(chunkText('', 10)).toEqual(['']);
    expect(chunkText('   ', 10)).toEqual(['   ']);
  });

  it('packs multiple short paragraphs into one chunk', () => {
    const text = 'a\n\nb\n\nc';
    expect(chunkText(text, 100)).toEqual(['a\n\nb\n\nc']);
  });

  it('respects max chunk size across packed paragraphs', () => {
    const text = 'short\n\nmedium text\n\nmore content here';
    const out = chunkText(text, 20);
    for (const chunk of out) {
      expect(chunk.length).toBeLessThanOrEqual(20);
    }
  });

  it('handles single long paragraph split into multiple chunks', () => {
    const text = 'Lorem ipsum dolor sit amet consectetur adipiscing elit';
    const out = chunkText(text, 15);
    expect(out.length).toBeGreaterThan(1);
    for (const chunk of out) {
      expect(chunk.length).toBeLessThanOrEqual(15);
    }
  });

  it('preserves paragraph breaks (\\n\\n) in output when present', () => {
    const text = 'first para\n\nsecond para';
    const out = chunkText(text, 100);
    expect(out[0]).toBe('first para\n\nsecond para');
  });
});
