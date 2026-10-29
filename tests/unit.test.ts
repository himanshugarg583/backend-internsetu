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
    expect(certificateFee(4)).toMatchObject({ baseAmount: '109.32', gstAmount: '19.68', totalAmount: '129.00', totalPaise: 12900 });
    expect(certificateFee(6)).toMatchObject({ baseAmount: '143.22', gstAmount: '25.78', totalAmount: '169.00', totalPaise: 16900 });
    expect(certificateFee(8)).toMatchObject({ baseAmount: '168.64', gstAmount: '30.36', totalAmount: '199.00', totalPaise: 19900 });
    expect(certificateFee(12)).toMatchObject({ baseAmount: '253.39', gstAmount: '45.61', totalAmount: '299.00', totalPaise: 29900 });
    expect(certificateFee(16)).toMatchObject({ baseAmount: '338.14', gstAmount: '60.86', totalAmount: '399.00', totalPaise: 39900 });
    expect(certificateFee(20)).toMatchObject({ baseAmount: '422.88', gstAmount: '76.12', totalAmount: '499.00', totalPaise: 49900 });
    expect(certificateFee(24)).toMatchObject({ baseAmount: '507.63', gstAmount: '91.37', totalAmount: '599.00', totalPaise: 59900 });
  });
});
