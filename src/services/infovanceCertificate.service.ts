import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fsp from 'fs/promises';
import { generateQrPng } from '../integrations/qr/qr';
import { renderPdf } from '../integrations/pdf/pdf';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

export interface InfovanceCertData {
  verificationId: string;
  name: string;
  domain: string;
  startDate: Date;
  endDate: Date;
  issueDate: Date;
  durationWeeks?: number;
  verificationUrl: string;
  website?: string;
  phone?: string;
  email?: string;
  udyam?: string;
}

export const infovanceCertificateService = {
  formatDate(d: Date): string {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  },

  formatDuration(start: Date, end: Date, durationWeeks?: number): string {
    if (durationWeeks) {
      if (durationWeeks % 4 === 0) {
        const m = durationWeeks / 4;
        return `${durationWeeks} Weeks (${m} Month${m > 1 ? 's' : ''})`;
      }
      return `${durationWeeks} Weeks`;
    }
    const days = Math.round((end.getTime() - start.getTime()) / 864e5) + 1;
    if (days >= 28) {
      const m = Math.round(days / 30.44);
      return `${m} Month${m > 1 ? 's' : ''}`;
    }
    const w = Math.max(1, Math.round(days / 7));
    return `${w} Week${w > 1 ? 's' : ''}`;
  },

  async getTemplateHtml(): Promise<string> {
    const templatePath = path.resolve(__dirname, '../../templates/certificate_template.html');
    return fsp.readFile(templatePath, 'utf-8');
  },

  async getSignatureBase64(): Promise<string | null> {
    const assetsDir = path.resolve(__dirname, '../../templates/assets');
    const candidates = ['signature.png', 'signature.jpg', 'signature.jpeg', 'sign.png', 'sign.jpg'];
    for (const name of candidates) {
      const p = path.join(assetsDir, name);
      try {
        const buf = await fsp.readFile(p);
        const ext = path.extname(name).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        // file doesn't exist, continue
      }
    }
    return null;
  },

  async renderHtml(data: InfovanceCertData): Promise<string> {
    const template = await this.getTemplateHtml();

    const startIso = data.startDate.toISOString().slice(0, 10);
    const endIso = data.endDate.toISOString().slice(0, 10);
    const issueIso = data.issueDate.toISOString().slice(0, 10);

    const startFmt = this.formatDate(data.startDate);
    const endFmt = this.formatDate(data.endDate);
    const issueFmt = this.formatDate(data.issueDate);
    const durFmt = this.formatDuration(data.startDate, data.endDate, data.durationWeeks);

    const website = data.website || 'linkedin.com/company/infovance-technologies';
    const phone = data.phone || '+91 86965 63594';
    const email = data.email || 'support@infovence.in';
    const udyam = data.udyam || 'UDYAM-DL-08-0012345';

    // Generate QR code PNG
    let qrImgTag = 'QR Code';
    try {
      const qrPng = await generateQrPng(data.verificationUrl);
      qrImgTag = `<img src="data:image/png;base64,${qrPng.toString('base64')}" style="width:100%!important;height:100%!important;display:block;" alt="QR Code">`;
    } catch (err) {
      logger.warn({ err }, 'Failed to generate QR code PNG for certificate HTML');
    }

    const verifiedBarHtml = `<div id="bar" class="bar ok"><span>&#10004; <b>Verified.</b> Certificate <b>${data.verificationId}</b> was issued by Infovance Technologies to <b>${data.name}</b>.</span><button onclick="window.print()">Print / Save as PDF</button></div>`;

    const footerContactsHtml = [website, phone, email].filter(Boolean).join('<span class="sep">|</span>');

    // Check for signature image
    const signatureDataUri = await this.getSignatureBase64();
    const signatureHtml = signatureDataUri
      ? `<div class="sig"><div style="height:48px;display:flex;align-items:flex-end;margin-bottom:4px;"><img src="${signatureDataUri}" alt="Signature" style="max-height:48px;max-width:180px;object-fit:contain;display:block;"></div><div class="sl"></div><b>Authorized Signatory</b><small>Infovance Technologies</small></div>`
      : `<div class="sig"><div style="height:48px;"></div><div class="sl"></div><b>Authorized Signatory</b><small>Infovance Technologies</small></div>`;

    let html = template
      .replace(/<title>.*?<\/title>/i, `<title>Certificate - ${data.name} | Infovance Technologies</title>`)
      .replace(/<div id="bar" class="bar"><\/div>/, verifiedBarHtml)
      .replace(/<b id="issued"><\/b>/, `<b id="issued">${issueFmt}</b>`)
      .replace(/<b id="cid"><\/b>/, `<b id="cid">${data.verificationId}</b>`)
      .replace(/<div class="a c name" id="name"><\/div>/, `<div class="a c name" id="name">${data.name}</div>`)
      .replace(/<span id="domain"><\/span>/, `<span id="domain">${data.domain}</span>`)
      .replace(/<b id="start"><\/b>/, `<b id="start">${startFmt}</b>`)
      .replace(/<b id="end"><\/b>/, `<b id="end">${endFmt}</b>`)
      .replace(/<span id="dur"><\/span>/, `<span id="dur">${durFmt}</span>`)
      .replace(/<small id="udyam"><\/small>/, `<small id="udyam">${udyam}</small>`)
      .replace(/<div class="a c foot" id="foot"><\/div>/, `<div class="a c foot" id="foot">${footerContactsHtml}</div>`)
      .replace(/<div class="sig"><div class="sl"><\/div><b>Authorized Signatory<\/b><small>Infovance Technologies<\/small><\/div>/, signatureHtml)
      .replace(/<div id="qr"><\/div>/, `<div id="qr">${qrImgTag}</div>`);

    // In the script: update CONFIG and REGISTRY cleanly
    const editPartStart = html.indexOf('/* ============ EDIT THIS PART ============ */');
    const editPartEnd = html.indexOf('/* ========================================= */');
    if (editPartStart !== -1 && editPartEnd !== -1) {
      const configReplacement = `/* ============ EDIT THIS PART ============ */
const CONFIG = {
  verifyBase: "${data.verificationUrl.split('?')[0]}",
  website: "${website}",
  phone: "${phone}",
  email: "${email}",
  udyam: "${udyam}"
};
const REGISTRY = [
  { id: "${data.verificationId}", name: "${data.name.replace(/"/g, '\\"')}", domain: "${data.domain.replace(/"/g, '\\"')}",
    start: "${startIso}", end: "${endIso}", issued: "${issueIso}" }
];
/* ========================================= */`;
      html = html.slice(0, editPartStart) + configReplacement + html.slice(editPartEnd + '/* ========================================= */'.length);
    }

    // Prevent duplicate QR code generation if qr already contains an img
    html = html.replace(
      /try\s*\{\s*new QRCode\(\$\("qr"\)[^;]+;\s*\}\s*catch\s*\(e\)\s*\{[^}]+\}/,
      `if (!$("qr").querySelector("img")) { try { new QRCode($("qr"), { text: url, width: 246, height: 246, colorDark: "#0B1020", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M }); } catch (e) { $("qr").textContent = "QR unavailable"; } }`
    );

    // Ensure mode is "ok" by default
    html = html.replace(
      /let rec = null,\s*mode = "pre";/,
      `let rec = REGISTRY[0], mode = "ok";`
    );

    return html;
  },

  async renderPdf(data: InfovanceCertData): Promise<{ pdfBuffer: Buffer; htmlContent: string }> {
    const htmlContent = await this.renderHtml(data);

    const tmpId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const storageCertDir = path.resolve(__dirname, '../../storage/certificates');
    await fsp.mkdir(storageCertDir, { recursive: true });

    const tmpHtml = path.join(storageCertDir, `tmp-${tmpId}.html`);
    const tmpPdf = path.join(storageCertDir, `tmp-${tmpId}.pdf`);

    await fsp.writeFile(tmpHtml, htmlContent, 'utf-8');

    const chromeCmd = process.env.CHROMIUM_BIN || (process.platform === 'win32' ? 'chrome' : 'chromium-browser');
    const args = [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-dev-shm-usage',
      `--print-to-pdf=${tmpPdf}`,
      tmpHtml,
    ];

    try {
      await execFileAsync(chromeCmd, args);
      const pdfBuffer = await fsp.readFile(tmpPdf);
      await Promise.all([
        fsp.rm(tmpHtml, { force: true }),
        fsp.rm(tmpPdf, { force: true }),
      ]);
      return { pdfBuffer, htmlContent };
    } catch (err) {
      logger.warn({ err }, 'Chromium headless PDF generation failed, falling back to pdfkit');
      await Promise.all([
        fsp.rm(tmpHtml, { force: true }).catch(() => {}),
        fsp.rm(tmpPdf, { force: true }).catch(() => {}),
      ]);

      // Fallback to pdfkit
      const qrPng = await generateQrPng(data.verificationUrl);
      const pdfBuffer = await renderPdf({
        title: 'Certificate of Internship',
        body: `This is to certify that ${data.name} has successfully completed the ${data.domain} Internship at Infovance Technologies from ${this.formatDate(data.startDate)} to ${this.formatDate(data.endDate)}.`,
        qrPng,
        landscape: true,
        footer: `Certificate ID: ${data.verificationId} | Verify at ${data.verificationUrl}`,
      });
      return { pdfBuffer, htmlContent };
    }
  },
};
