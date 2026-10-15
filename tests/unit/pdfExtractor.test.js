import { describe, it, expect } from 'vitest';
import { extractPdfText } from '@supportflow/shared';
import { PdfExtractionError, InvalidFileError } from '@supportflow/shared/errors';

function createValidSinglePagePdf(text = 'SupportFlow Customer Support Policy') {
  const streamContent = `BT\n/F1 18 Tf\n50 700 Td\n(${text}) Tj\nET`;
  const streamLength = Buffer.byteLength(streamContent);

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000222 00000 n 
0000000318 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
400
%%EOF
`;
  return Buffer.from(pdf, 'utf8');
}

function createTextlessPdf() {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 0 >>
stream
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000185 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
230
%%EOF
`;
  return Buffer.from(pdf, 'utf8');
}

describe('PDF Text Extraction Unit Tests', () => {
  it('extracts page text successfully from valid PDF', async () => {
    const buffer = createValidSinglePagePdf('Refund policy applies within 30 days');
    const result = await extractPdfText(buffer);

    expect(result.pageCount).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageNumber).toBe(1);
    expect(result.pages[0].text).toContain('Refund policy applies within 30 days');
  });

  it('rejects non-buffer input with InvalidFileError', async () => {
    await expect(extractPdfText(null)).rejects.toThrow(InvalidFileError);
    await expect(extractPdfText('not-a-buffer')).rejects.toThrow(InvalidFileError);
  });

  it('rejects non-PDF garbage header with PDF_CORRUPT', async () => {
    const corruptBuffer = Buffer.from('NOT_A_PDF_HEADER_AT_ALL');
    await expect(extractPdfText(corruptBuffer)).rejects.toThrow(PdfExtractionError);

    try {
      await extractPdfText(corruptBuffer);
    } catch (err) {
      expect(err.code).toBe('PDF_CORRUPT');
    }
  });

  it('rejects corrupt PDF body with PDF_CORRUPT', async () => {
    const corruptBuffer = Buffer.from('%PDF-1.4 garbage truncated content');
    try {
      await extractPdfText(corruptBuffer);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PdfExtractionError);
      expect(err.code).toBe('PDF_CORRUPT');
    }
  });

  it('rejects textless / scanned PDF with PDF_NO_TEXT', async () => {
    const textlessBuffer = createTextlessPdf();
    try {
      await extractPdfText(textlessBuffer);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PdfExtractionError);
      expect(err.code).toBe('PDF_NO_TEXT');
    }
  });

  it('enforces maxPages limit with PDF_TOO_MANY_PAGES', async () => {
    const buffer = createValidSinglePagePdf('Page 1');
    // maxPages set to 0 triggers limit
    try {
      await extractPdfText(buffer, { maxPages: 0 });
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PdfExtractionError);
      expect(err.code).toBe('PDF_TOO_MANY_PAGES');
    }
  });
});
