import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

const ASSETS = path.resolve(__dirname, '../../../templates/assets');
const asset = (name: string) => {
  const p = path.join(ASSETS, name);
  return fs.existsSync(p) ? p : null;
};

export const COMPANY = {
  name: 'Infovance Technologies',
  udyam: 'UDYAM-RJ-17-0703781',
  email: 'support@infovence.in',
  phone: '+91 86965 63594',
  web: 'linkedin.com/company/infovance-technologies',
};

export interface ReceiptData {
  receiptNo: string;
  status: 'PAID' | 'REFUNDED';
  paidAt: Date;
  customer: { name: string; email: string; phone?: string | null; college?: string | null; city?: string | null };
  item: { title: string; description: string; internId: string; period: string };
  orderId: string;
  paymentId: string | null;
  method: string;
  currency: string;
  baseAmount: number;
  gstAmount: number;
  gstPercent: number;
  totalAmount: number;
}

const C = {
  navy: '#0B1020',
  ink: '#111827',
  muted: '#6B7280',
  line: '#E5E7EB',
  soft: '#F5F3FF',
  purple: '#6D28D9',
  cyan: '#06B6D4',
  green: '#047857',
  greenBg: '#ECFDF5',
  red: '#B91C1C',
  redBg: '#FEF2F2',
};

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function twoDigits(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}
/** Indian numbering system (lakh/crore). */
export function amountInWords(amount: number, currency = 'INR') {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  const unit = currency === 'INR' ? 'Rupees' : currency;
  let words = `${parts.join(' ') || 'Zero'} ${unit}`;
  if (paise) words += ` and ${twoDigits(paise)} Paise`;
  return `${words} Only`;
}

const money = (v: number, cur: string) => `${cur === 'INR' ? 'Rs.' : cur} ${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const fmtDateTime = (d: Date) => `${fmtDate(d)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} IST`;

/** Renders a branded, tax-style payment receipt (A4 portrait). */
export function renderReceiptPdf(d: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Payment Receipt ${d.receiptNo}`, Author: COMPANY.name, Subject: 'Payment Receipt' } });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => reject(new Error('PDF generation timed out')), 15000);
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('error', (e) => { clearTimeout(timer); reject(e); });
    doc.on('end', () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });

    const fonts = { r: 'Helvetica', m: 'Helvetica', b: 'Helvetica-Bold' };
    const reg = (key: 'r' | 'm' | 'b', file: string, name: string) => {
      const p = asset(path.join('fonts', file));
      if (p) { doc.registerFont(name, p); fonts[key] = name; }
    };
    reg('r', 'Poppins-Regular.ttf', 'P-R');
    reg('m', 'Poppins-Medium.ttf', 'P-M');
    reg('b', 'Poppins-Bold.ttf', 'P-B');

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 44;
    const CW = W - M * 2;

    // Header banner
    const banner = asset('1_logo_dark.png');
    // Crop the tagline row off the banner; keep logo fully visible.
    const bannerH = 112;
    if (banner) {
      const ih = (800 / 2480) * W;
      doc.save().rect(0, 0, W, bannerH).clip();
      doc.image(banner, 0, -ih * 0.06, { width: W, height: ih });
      doc.restore();
    } else {
      doc.rect(0, 0, W, bannerH).fill(C.navy);
    }
    const grad = doc.linearGradient(0, bannerH, W, bannerH).stop(0, C.purple).stop(1, C.cyan);
    doc.rect(0, bannerH, W, 4).fill(grad);

    // Title row
    let y = bannerH + 22;
    doc.font(fonts.b).fontSize(20).fillColor(C.ink).text('PAYMENT RECEIPT', M, y, { characterSpacing: 1.5 });
    doc.font(fonts.r).fontSize(8.5).fillColor(C.muted).text(`${COMPANY.name}  |  ${COMPANY.udyam}`, M, y + 28);

    const paid = d.status === 'PAID';
    const badge = paid ? 'PAID' : 'REFUNDED';
    doc.font(fonts.b).fontSize(10);
    const bw = doc.widthOfString(badge) + 30;
    doc.roundedRect(W - M - bw, y + 2, bw, 24, 12).fill(paid ? C.greenBg : C.redBg);
    doc.fillColor(paid ? C.green : C.red).text(badge, W - M - bw, y + 8, { width: bw, align: 'center', characterSpacing: 1 });

    // Meta grid
    y += 56;
    const meta: [string, string][] = [
      ['Receipt No.', d.receiptNo],
      ['Date of Payment', fmtDateTime(d.paidAt)],
      ['Payment Method', d.method],
      ['Transaction ID', d.paymentId ?? '-'],
    ];
    const widths = [0.29, 0.27, 0.19, 0.25].map((r) => r * CW);
    doc.roundedRect(M, y, CW, 50, 8).fill(C.soft);
    let mx = M;
    meta.forEach(([k, v], i) => {
      const x = mx + 14;
      doc.font(fonts.m).fontSize(7.2).fillColor(C.muted).text(k.toUpperCase(), x, y + 11, { width: widths[i] - 18, characterSpacing: 0.6 });
      doc.font(fonts.b).fontSize(8.2).fillColor(C.ink).text(v, x, y + 25, { width: widths[i] - 18, ellipsis: true, lineBreak: false });
      mx += widths[i];
    });

    // Billed to / Issued by
    y += 66;
    const colW = (CW - 24) / 2;
    const block = (x: number, title: string, lines: (string | null | undefined)[]) => {
      doc.font(fonts.m).fontSize(7.5).fillColor(C.purple).text(title, x, y, { characterSpacing: 1 });
      doc.moveTo(x, y + 14).lineTo(x + colW, y + 14).lineWidth(0.6).strokeColor(C.line).stroke();
      let ly = y + 22;
      lines.filter(Boolean).forEach((l, i) => {
        doc.font(i === 0 ? fonts.b : fonts.r).fontSize(i === 0 ? 11 : 9).fillColor(i === 0 ? C.ink : C.muted).text(l as string, x, ly, { width: colW });
        ly += i === 0 ? 17 : 13.5;
      });
    };
    block(M, 'BILLED TO', [d.customer.name, d.customer.email, d.customer.phone, [d.customer.college, d.customer.city].filter(Boolean).join(', ') || null]);
    block(M + colW + 24, 'ISSUED BY', [COMPANY.name, COMPANY.email, COMPANY.phone, COMPANY.web]);

    // Items table
    y += 98;
    const cols = [{ t: '#', w: 28 }, { t: 'DESCRIPTION', w: CW - 28 - 110 - 110 }, { t: 'INTERN ID', w: 110 }, { t: 'AMOUNT', w: 110 }];
    doc.rect(M, y, CW, 26).fill(C.navy);
    let x = M;
    cols.forEach((c, i) => {
      doc.font(fonts.m).fontSize(7.8).fillColor('#FFFFFF').text(c.t, x + 10, y + 9, { width: c.w - 20, align: i === 3 ? 'right' : 'left', characterSpacing: 0.8 });
      x += c.w;
    });
    y += 26;
    const rowH = 74;
    doc.rect(M, y, CW, rowH).fill('#FFFFFF');
    x = M;
    doc.font(fonts.r).fontSize(9).fillColor(C.muted).text('1', x + 10, y + 12, { width: cols[0].w - 14 });
    x += cols[0].w;
    doc.font(fonts.b).fontSize(9.6).fillColor(C.ink);
    const titleH = doc.heightOfString(d.item.title, { width: cols[1].w - 20 });
    doc.text(d.item.title, x + 10, y + 11, { width: cols[1].w - 20 });
    doc.font(fonts.r).fontSize(8).fillColor(C.muted).text(`${d.item.description}\nPeriod: ${d.item.period}`, x + 10, y + 14 + titleH, { width: cols[1].w - 20, lineGap: 1 });
    x += cols[1].w;
    doc.font(fonts.m).fontSize(8.6).fillColor(C.ink).text(d.item.internId, x + 10, y + 12, { width: cols[2].w - 20 });
    x += cols[2].w;
    doc.font(fonts.b).fontSize(9.6).fillColor(C.ink).text(money(d.baseAmount, d.currency), x + 10, y + 12, { width: cols[3].w - 20, align: 'right' });
    y += rowH;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(C.line).stroke();

    // Totals
    y += 14;
    const tx = M + CW - 230;
    const totalRow = (label: string, value: string, bold = false) => {
      doc.font(bold ? fonts.b : fonts.r).fontSize(bold ? 11 : 9).fillColor(bold ? C.ink : C.muted).text(label, tx, y, { width: 120 });
      doc.font(bold ? fonts.b : fonts.m).fontSize(bold ? 11 : 9).fillColor(C.ink).text(value, tx + 110, y, { width: 120, align: 'right' });
      y += bold ? 20 : 17;
    };
    totalRow('Subtotal', money(d.baseAmount, d.currency));
    totalRow(`GST (${d.gstPercent}%)`, money(d.gstAmount, d.currency));
    y += 4;
    doc.roundedRect(tx - 12, y - 6, 242, 34, 6).fill(C.soft);
    y += 4;
    totalRow(paid ? 'Total Paid' : 'Total Refunded', money(d.totalAmount, d.currency), true);

    // Amount in words
    y += 14;
    doc.font(fonts.m).fontSize(7.5).fillColor(C.muted).text('AMOUNT IN WORDS', M, y, { characterSpacing: 0.8 });
    doc.font(fonts.b).fontSize(9.2).fillColor(C.ink).text(amountInWords(d.totalAmount, d.currency), M, y + 13, { width: CW });

    // Reference box
    y += 44;
    doc.roundedRect(M, y, CW, 42, 6).lineWidth(0.8).strokeColor(C.line).stroke();
    doc.font(fonts.r).fontSize(8).fillColor(C.muted)
      .text(`Order ID: `, M + 14, y + 10, { continued: true }).font(fonts.m).fillColor(C.ink).text(d.orderId, { continued: true })
      .font(fonts.r).fillColor(C.muted).text(`      Payment Gateway: `, { continued: true }).font(fonts.m).fillColor(C.ink).text('Razorpay');
    doc.font(fonts.r).fontSize(7.6).fillColor(C.muted).text('Keep this receipt for your records. Quote the Receipt No. or Order ID for any payment-related query.', M + 14, y + 25, { width: CW - 28 });

    // Signature + seal
    const sigY = Math.min(Math.max(y + 96, H - 160), H - 112);
    const sign = asset('signature.png');
    if (sign) doc.image(sign, W - M - 170, sigY - 34, { height: 32 });
    doc.moveTo(W - M - 180, sigY).lineTo(W - M, sigY).lineWidth(0.8).strokeColor(C.ink).stroke();
    doc.font(fonts.b).fontSize(9.5).fillColor(C.ink).text('Authorized Signatory', W - M - 180, sigY + 6, { width: 180, align: 'right' });
    doc.font(fonts.r).fontSize(8).fillColor(C.muted).text(COMPANY.name, W - M - 180, sigY + 20, { width: 180, align: 'right' });

    const sym = asset('7_symbol_only.png');
    const sx = M + 46;
    const sy = sigY - 6;
    doc.circle(sx, sy, 40).lineWidth(1.6).strokeColor(C.purple).stroke();
    doc.circle(sx, sy, 33).lineWidth(0.6).strokeColor(C.purple).dash(2, { space: 2 }).stroke().undash();
    if (sym) doc.image(sym, sx - 16, sy - 20, { width: 32 });
    doc.font(fonts.b).fontSize(6).fillColor(C.purple).text(paid ? 'PAYMENT RECEIVED' : 'REFUNDED', sx - 40, sy + 13, { width: 80, align: 'center', characterSpacing: 0.6 });
    doc.font(fonts.r).fontSize(7.6).fillColor(C.muted).text('This is a computer-generated receipt and\ndoes not require a physical signature.', M + 100, sigY - 14, { width: 200 });

    // Footer
    const fh = 56;
    const fy = H - fh;
    doc.rect(0, fy - 3, W, 3).fill(doc.linearGradient(0, fy, W, fy).stop(0, C.purple).stop(1, C.cyan));
    doc.rect(0, fy, W, fh).fill(C.navy);
    const items = [['WEBSITE', COMPANY.web], ['PHONE', COMPANY.phone], ['EMAIL', COMPANY.email]];
    const fw = W / 3;
    items.forEach(([k, v], i) => {
      doc.font(fonts.m).fontSize(6.8).fillColor(C.cyan).text(k, i * fw, fy + 13, { width: fw, align: 'center', characterSpacing: 1.6 });
      doc.font(fonts.r).fontSize(i === 0 ? 7.4 : 8.4).fillColor('#E5E7EB').text(v, i * fw + 6, fy + 27, { width: fw - 12, align: 'center', lineBreak: false });
    });

    doc.end();
  });
}
