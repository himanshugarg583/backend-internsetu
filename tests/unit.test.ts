import { describe, expect, it } from 'vitest';
import { certificateFee } from '../src/config/payment';
import { resolveSafe } from '../src/config/storage';
import { fillPlaceholders } from '../src/integrations/pdf/pdf';
import { isHost } from '../src/utils/helpers';

describe('utilities', () => {
  it('validates hosts by parsed hostname', () => {
    expect(isHost('https://github.com/a/b', ['github.com'])).toBe(true);
    expect(isHost('https://www.linkedin.com/in/x', ['linkedin.com'])).toBe(true);
    expect(isHost('https://github.com.evil.com/a', ['github.com'])).toBe(false);
    expect(isHost('https://evil.com/?q=github.com', ['github.com'])).toBe(false);
    expect(isHost('http://github.com/a', ['github.com'])).toBe(false);
    expect(isHost('javascript:alert(1)', ['github.com'])).toBe(false);
  });

  it('prevents path traversal', () => {
    expect(() => resolveSafe('../etc/passwd')).toThrow();
    expect(() => resolveSafe('certificates/../../x')).toThrow();
    expect(() => resolveSafe('/abs/path')).toThrow();
    expect(resolveSafe('certificates/a.pdf')).toContain('certificates');
  });

  it('fills placeholders', () => {
    expect(fillPlaceholders('Hi {{name}}, {{ domain }} {{unknown}}', { name: 'A', domain: 'Web' })).toBe('Hi A, Web {{unknown}}');
  });

  it('computes fees with exact paise', () => {
    expect(certificateFee()).toMatchObject({ baseAmount: '499.00', gstAmount: '89.82', totalAmount: '588.82', totalPaise: 58882 });
  });
});
