import { describe, it, expect } from 'vitest';
import { chunkPages } from '@supportflow/shared';

describe('Document Chunker Unit Tests', () => {
  it('chunks small single-page document into a single chunk', () => {
    const pages = [
      { pageNumber: 1, text: 'Short policy text for testing support flow.' }
    ];

    const chunks = chunkPages(pages, { chunkSizeChars: 800, chunkOverlapChars: 120 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].content).toBe('Short policy text for testing support flow.');
    expect(chunks[0].charCount).toBe(chunks[0].content.length);
    expect(chunks[0].contentSha256).toHaveLength(64);
  });

  it('guarantees chunks NEVER cross page boundaries', () => {
    const pages = [
      { pageNumber: 1, text: 'A'.repeat(1200) },
      { pageNumber: 2, text: 'B'.repeat(1200) }
    ];

    const chunks = chunkPages(pages, { chunkSizeChars: 500, chunkOverlapChars: 50 });

    expect(chunks.length).toBeGreaterThan(2);

    for (const chunk of chunks) {
      if (chunk.pageNumber === 1) {
        expect(chunk.content).not.toContain('B');
      }
      if (chunk.pageNumber === 2) {
        expect(chunk.content).not.toContain('A');
      }
      expect([1, 2]).toContain(chunk.pageNumber);
    }
  });

  it('sequential chunk indexes are contiguous across pages', () => {
    const pages = [
      { pageNumber: 1, text: 'First page text paragraph 1.\n\nFirst page text paragraph 2.' },
      { pageNumber: 2, text: 'Second page text paragraph 1.\n\nSecond page text paragraph 2.' }
    ];

    const chunks = chunkPages(pages, { chunkSizeChars: 30, chunkOverlapChars: 5 });

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, idx) => {
      expect(chunk.chunkIndex).toBe(idx);
    });
  });

  it('prefers sentence or paragraph breaks when chunking', () => {
    const text = 'Sentence one here. Sentence two follows here. Sentence three concludes the paragraph.';
    const pages = [{ pageNumber: 1, text }];

    const chunks = chunkPages(pages, { chunkSizeChars: 45, chunkOverlapChars: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk should not cut mid-word when sentence boundary exists
    expect(chunks[0].content).toMatch(/\.$/);
  });

  it('ignores empty pages or whitespace-only pages', () => {
    const pages = [
      { pageNumber: 1, text: '   ' },
      { pageNumber: 2, text: 'Valid page content.' },
      { pageNumber: 3, text: '' }
    ];

    const chunks = chunkPages(pages);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageNumber).toBe(2);
    expect(chunks[0].content).toBe('Valid page content.');
  });
});
