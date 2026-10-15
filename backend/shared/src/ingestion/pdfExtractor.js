import { PDFParse, PasswordException, InvalidPDFException, FormatError } from 'pdf-parse';
import { PdfExtractionError, InvalidFileError } from '../errors.js';

/**
 * Extracts text page-by-page from a PDF buffer.
 * Enforces security limits and classifies errors cleanly:
 * - PDF_CORRUPT
 * - PDF_ENCRYPTED
 * - PDF_TOO_MANY_PAGES
 * - PDF_NO_TEXT (scanned or image-only)
 *
 * @param {Buffer} buffer - Raw PDF buffer
 * @param {object} options
 * @param {number} [options.maxPages=300] - Maximum allowed pages
 * @returns {Promise<{ pageCount: number, pages: Array<{ pageNumber: number, text: string }> }>}
 */
export async function extractPdfText(buffer, { maxPages = 300 } = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new InvalidFileError('A valid file buffer is required');
  }

  // Quick signature check
  if (buffer.length < 5 || buffer.toString('utf8', 0, 5) !== '%PDF-') {
    throw new PdfExtractionError('File header does not match PDF signature', 'PDF_CORRUPT');
  }

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
  } catch (err) {
    if (err instanceof PasswordException || err.message?.toLowerCase().includes('password')) {
      throw new PdfExtractionError('PDF is password protected or encrypted', 'PDF_ENCRYPTED');
    }
    throw new PdfExtractionError(`Failed to initialize PDF parser: ${err.message}`, 'PDF_CORRUPT');
  }

  let textResult;
  try {
    textResult = await parser.getText();
  } catch (err) {
    if (err instanceof PasswordException || err.message?.toLowerCase().includes('password')) {
      throw new PdfExtractionError('PDF is password protected or encrypted', 'PDF_ENCRYPTED');
    }
    if (err instanceof InvalidPDFException || err instanceof FormatError) {
      throw new PdfExtractionError(`Corrupt or invalid PDF structure: ${err.message}`, 'PDF_CORRUPT');
    }
    throw new PdfExtractionError(`Failed to extract text from PDF: ${err.message}`, 'PDF_CORRUPT');
  }

  const pageCount = textResult.total;
  if (pageCount > maxPages) {
    throw new PdfExtractionError(
      `PDF has ${pageCount} pages, exceeding the maximum allowed limit of ${maxPages}`,
      'PDF_TOO_MANY_PAGES'
    );
  }

  if (pageCount === 0 || !textResult.pages || textResult.pages.length === 0) {
    throw new PdfExtractionError(
      'PDF contains no extractable text or is a scanned image',
      'PDF_NO_TEXT'
    );
  }

  const pages = [];
  let totalExtractedLength = 0;

  for (const p of textResult.pages) {
    const rawText = (p.text || '').trim();
    // Normalize unicode and replace multiple spaces/tabs while preserving line breaks
    const normalizedText = rawText
      .replace(/[ \t]+/g, ' ')
      .replace(/\r\n/g, '\n')
      .trim();

    totalExtractedLength += normalizedText.length;
    pages.push({
      pageNumber: p.num,
      text: normalizedText
    });
  }

  // If after checking all pages, there is 0 extractable text, reject as scanned / image-only PDF
  if (totalExtractedLength === 0) {
    throw new PdfExtractionError(
      'PDF contains no extractable text or is a scanned image',
      'PDF_NO_TEXT'
    );
  }

  return {
    pageCount,
    pages
  };
}
