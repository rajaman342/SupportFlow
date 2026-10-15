import crypto from 'node:crypto';

/**
 * Splits text into page-scoped chunks respecting chunk_size_chars and chunk_overlap_chars.
 *
 * Invariant: Chunks NEVER cross page boundaries (each chunk has exactly one page_number).
 * Splits prefer paragraph boundaries, then sentence boundaries, then words.
 *
 * @param {Array<{ pageNumber: number, text: string }>} pages - Array of extracted page objects
 * @param {object} options
 * @param {number} [options.chunkSizeChars=800] - Target chunk size in characters
 * @param {number} [options.chunkOverlapChars=120] - Overlap in characters between adjacent chunks on the same page
 * @returns {Array<{ chunkIndex: number, pageNumber: number, content: string, contentSha256: string, charCount: number }>}
 */
export function chunkPages(pages, { chunkSizeChars = 800, chunkOverlapChars = 120 } = {}) {
  if (!Array.isArray(pages)) {
    return [];
  }

  const chunks = [];
  let globalChunkIndex = 0;

  for (const page of pages) {
    const pageText = (page.text || '').trim();
    if (!pageText) {
      continue;
    }

    const pageChunks = splitPageText(pageText, chunkSizeChars, chunkOverlapChars);

    for (const textChunk of pageChunks) {
      const cleanContent = textChunk.trim();
      if (!cleanContent) continue;

      const contentSha256 = crypto
        .createHash('sha256')
        .update(cleanContent, 'utf8')
        .digest('hex');

      chunks.push({
        chunkIndex: globalChunkIndex++,
        pageNumber: page.pageNumber,
        content: cleanContent,
        contentSha256,
        charCount: cleanContent.length
      });
    }
  }

  return chunks;
}

/**
 * Splits single page text into overlapping chunks without crossing the page boundary.
 *
 * @param {string} text
 * @param {number} chunkSize
 * @param {number} overlap
 * @returns {string[]}
 */
function splitPageText(text, chunkSize, overlap) {
  if (text.length <= chunkSize) {
    return [text];
  }

  const results = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;

    if (endIndex >= text.length) {
      results.push(text.slice(startIndex));
      break;
    }

    // Attempt to find a clean break (paragraph, sentence, line, or space)
    const candidateSlice = text.slice(startIndex, endIndex);

    let splitOffset = -1;

    // 1. Try paragraph break
    const paraIdx = candidateSlice.lastIndexOf('\n\n');
    if (paraIdx !== -1 && paraIdx > 0) {
      splitOffset = startIndex + paraIdx + 2;
    } else {
      // 2. Try sentence end (. ! ? followed by whitespace or at end of chunk)
      const sentenceRegex = /([.!?])(?:\s+|$)/g;
      let match;
      let lastSentenceEnd = -1;
      while ((match = sentenceRegex.exec(candidateSlice)) !== null) {
        lastSentenceEnd = match.index + 1;
      }
      if (lastSentenceEnd !== -1 && lastSentenceEnd > 0) {
        splitOffset = startIndex + lastSentenceEnd;
      } else {
        // 3. Try line break
        const lineIdx = candidateSlice.lastIndexOf('\n');
        if (lineIdx !== -1 && lineIdx > 0) {
          splitOffset = startIndex + lineIdx + 1;
        } else {
          // 4. Try whitespace
          const spaceIdx = candidateSlice.lastIndexOf(' ');
          if (spaceIdx !== -1 && spaceIdx > 0) {
            splitOffset = startIndex + spaceIdx + 1;
          }
        }
      }
    }

    const actualEnd = splitOffset !== -1 ? splitOffset : endIndex;

    const chunkStr = text.slice(startIndex, actualEnd).trim();
    if (chunkStr.length > 0) {
      results.push(chunkStr);
    }

    // Advance start position respecting overlap
    const step = actualEnd - startIndex;
    if (step <= overlap) {
      startIndex = actualEnd; // Force forward movement if chunk is smaller than overlap
    } else {
      startIndex = actualEnd - overlap;
    }
  }

  return results;
}
