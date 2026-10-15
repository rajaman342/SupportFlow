import fs from 'node:fs';
import path from 'node:path';
import { extractPdfText } from '../backend/shared/src/index.js';

/**
 * Builds a multi-page PDF buffer purely in Node without external native dependencies.
 * @param {Array<string>} pagesText Array of text strings, one per page.
 * @returns {Buffer} Valid PDF buffer.
 */
export function buildMultiPagePdf(pagesText) {
  const objects = [];

  // obj 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  const pageCount = pagesText.length;
  const kids = [];

  // Calculate object IDs:
  // 1: Catalog
  // 2: Pages
  // Then for each page i (0-indexed):
  // Page obj: 3 + i*3
  // Contents obj: 4 + i*3
  // Font obj: 5 + i*3
  for (let i = 0; i < pageCount; i++) {
    const pageObjId = 3 + i * 3;
    kids.push(`${pageObjId} 0 R`);
  }

  // obj 2: Pages
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>\nendobj`);

  for (let i = 0; i < pageCount; i++) {
    const pageObjId = 3 + i * 3;
    const contentsObjId = 4 + i * 3;
    const fontObjId = 5 + i * 3;

    // Split text into lines for readable PostScript stream
    const lines = pagesText[i].split('\n').filter((l) => l.trim().length > 0);
    let streamBody = 'BT\n/F1 12 Tf\n50 720 Td\n18 TL\n';
    for (const line of lines) {
      // Escape parentheses in PDF text strings
      const safeLine = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      streamBody += `(${safeLine}) Tj\nT*\n`;
    }
    streamBody += 'ET';
    const streamLength = Buffer.byteLength(streamBody, 'utf8');

    // Page object
    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentsObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>\nendobj`
    );

    // Contents object
    objects.push(
      `${contentsObjId} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamBody}\nendstream\nendobj`
    );

    // Font object
    objects.push(
      `${fontObjId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
    );
  }

  // Assemble full PDF with xref table
  let pdfContent = '%PDF-1.4\n';
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdfContent, 'utf8'));
    pdfContent += objects[i] + '\n';
  }

  const startXref = Buffer.byteLength(pdfContent, 'utf8');
  const totalObjCount = objects.length + 1; // including 0 0 obj

  pdfContent += `xref\n0 ${totalObjCount}\n0000000000 65535 f \n`;
  for (let i = 0; i < offsets.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, '0');
    pdfContent += `${offsetStr} 00000 n \n`;
  }

  pdfContent += `trailer\n<< /Size ${totalObjCount} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  return Buffer.from(pdfContent, 'utf8');
}

export const SYNTHETIC_POLICIES = [
  {
    filename: 'refund_policy.pdf',
    title: 'Customer Refund and Returns Policy',
    pages: [
      'Customer Refund and Returns Policy - General Terms\nRefunds can be requested within 30 days of product delivery.\nProof of purchase, order receipt, or invoice number is mandatory for all claims.\nReturned items must be undamaged, unworn, and in their original packaging with intact tags.\nApproved refunds will be processed back to the original payment method within 5 to 7 business days.',
      'Exclusions, Digital Goods, and Return Shipping Fees\nDigital downloads, software licenses, personalized products, and perishable goods are strictly non-refundable.\nA standard restocking and return shipping fee of $5.99 applies to all elective returns.\nReturn shipping fees are waived if the item arrived damaged or defective from our warehouse.\nClaims for defective items must be submitted within 48 hours of initial delivery.'
    ]
  },
  {
    filename: 'shipping_policy.pdf',
    title: 'Shipping and Delivery Guidelines',
    pages: [
      'Shipping and Delivery Guidelines - Shipping Options\nStandard domestic shipping takes 3 to 5 business days and is complimentary on orders over $50.\nExpress delivery takes 1 to 2 business days for a flat surcharge of $14.99.\nOrders submitted before 2 PM Eastern Time are dispatched on the same business day.\nOrders placed over weekends or statutory holidays are fulfilled on the next business day.',
      'International Shipments and Lost Parcel Inquiries\nInternational shipping typically takes 7 to 14 business days subject to customs clearance.\nCustoms duties and import taxes are the sole responsibility of the recipient.\nIf a parcel tracking status is stalled, lost parcel claims must be filed within 14 days of the estimated delivery date.\nApproved lost parcel claims are eligible for an immediate free reshipment or store credit.'
    ]
  },
  {
    filename: 'security_account_policy.pdf',
    title: 'User Account Security and Access Policy',
    pages: [
      'User Account Security - Password and Lockout Rules\nUser passwords must contain at least 12 characters and include both uppercase and numeric characters.\nAccounts are automatically locked after 5 consecutive failed authentication attempts.\nAccount unlock requests require email confirmation or identity verification with support.\nSession tokens expire automatically after 15 minutes of inactivity for agent security.',
      'Multi-Factor Authentication and Security Alerts\nMulti-factor authentication (MFA) is strictly mandatory for all administrative and billing accounts.\nChanges to email addresses or payment profiles trigger an instant automated security alert.\nIf unauthorized access is suspected, agents can immediately revoke all active refresh tokens.\nSupport agents will never request your account password under any circumstances.'
    ]
  },
  {
    filename: 'subscription_cancellation_policy.pdf',
    title: 'Subscription Plans and Cancellation Terms',
    pages: [
      'Subscription Plans and Billing Renewals\nRecurring subscriptions renew automatically at the conclusion of each monthly or annual billing cycle.\nCustomers have a 14-day cooling-off window following an annual renewal to request a full refund.\nCancellations take effect at the conclusion of the currently paid billing period.\nCustomers maintain uninterrupted access to premium services until the expiration date.',
      'Mid-Term Cancellations and Enterprise Agreements\nMonthly consumer subscription plans do not offer pro-rated refunds for mid-month cancellations.\nAnnual enterprise contracts may request pro-rated cancellation upon providing 30 days written notice.\nEarly contract termination fees may apply to enterprise customized tiers as specified in individual master service agreements.\nDowngrading from an annual to a monthly plan takes effect at the next renewal cycle.'
    ]
  }
];

async function main() {
  const targetDir = path.resolve(process.cwd(), 'samples/knowledge-base');
  fs.mkdirSync(targetDir, { recursive: true });

  console.log(`Generating synthetic knowledge base in: ${targetDir}`);

  for (const policy of SYNTHETIC_POLICIES) {
    const pdfBuffer = buildMultiPagePdf(policy.pages);
    const pdfPath = path.join(targetDir, policy.filename);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Also write a markdown/text reference file
    const txtPath = path.join(targetDir, policy.filename.replace('.pdf', '.md'));
    const mdContent = `# ${policy.title}\n\n` + policy.pages.map((p, idx) => `## Page ${idx + 1}\n\n${p}\n`).join('\n');
    fs.writeFileSync(txtPath, mdContent);

    // Verify extraction works cleanly
    const extracted = await extractPdfText(pdfBuffer);
    console.log(`✓ Generated ${policy.filename} (${extracted.pageCount} pages, ${pdfBuffer.length} bytes)`);
  }

  console.log('Knowledge base generation complete.');
}

if (process.argv[1] && process.argv[1].endsWith('generate-synthetic-pdfs.js')) {
  main().catch((err) => {
    console.error('Failed to generate synthetic PDFs:', err);
    process.exit(1);
  });
}
