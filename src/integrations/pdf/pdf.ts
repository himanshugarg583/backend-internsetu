import PDFDocument from 'pdfkit';

export const fillPlaceholders = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key: string) => values[key.toLowerCase()] ?? m);

interface RenderOptions {
  title: string;
  body: string;
  qrPng?: Buffer;
  footer?: string;
  landscape?: boolean;
  timeoutMs?: number;
}

/** Renders a simple branded PDF from filled template text. */
export function renderPdf(opts: RenderOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: opts.landscape ? 'landscape' : 'portrait', margin: 56 });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => reject(new Error('PDF generation timed out')), opts.timeoutMs ?? 15000);
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    doc.on('end', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });

    doc.fontSize(22).font('Helvetica-Bold').text(opts.title, { align: 'center' });
    doc.moveDown(1.5);
    doc.fontSize(12).font('Helvetica').text(opts.body, { align: 'left', lineGap: 4 });
    if (opts.qrPng) {
      const size = 110;
      doc.image(opts.qrPng, doc.page.width - size - 56, doc.page.height - size - 80, { width: size });
    }
    if (opts.footer) {
      doc.fontSize(9).fillColor('#555').text(opts.footer, 56, doc.page.height - 60, {
        width: doc.page.width - 112 - (opts.qrPng ? 120 : 0),
      });
    }
    doc.end();
  });
}
