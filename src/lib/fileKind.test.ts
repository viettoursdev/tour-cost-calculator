import { describe, it, expect } from 'vitest';
import { fileKind, canPreview } from './fileKind';

describe('fileKind', () => {
  it('ảnh theo mime hoặc đuôi', () => {
    expect(fileKind('a.png')).toBe('image');
    expect(fileKind('noext', 'image/jpeg')).toBe('image');
  });
  it('pdf', () => {
    expect(fileKind('hopdong.pdf')).toBe('pdf');
    expect(fileKind('x', 'application/pdf')).toBe('pdf');
  });
  it('office (word/excel/ppt)', () => {
    expect(fileKind('baogia.docx')).toBe('office');
    expect(fileKind('bangke.xlsx')).toBe('office');
    expect(fileKind('slide.pptx')).toBe('office');
    expect(fileKind('x', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('office');
  });
  it('text/csv', () => {
    expect(fileKind('data.csv')).toBe('text');
    expect(fileKind('note.txt')).toBe('text');
  });
  it('khác → other', () => {
    expect(fileKind('archive.zip')).toBe('other');
    expect(canPreview('archive.zip')).toBe(false);
    expect(canPreview('a.pdf')).toBe(true);
  });
});
