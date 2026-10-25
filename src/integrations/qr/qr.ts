import QRCode from 'qrcode';

export const generateQrPng = (text: string): Promise<Buffer> =>
  QRCode.toBuffer(text, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 300 });
