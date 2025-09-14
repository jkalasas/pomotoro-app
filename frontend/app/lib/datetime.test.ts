import { describe, it, expect } from 'vitest';
import { parseApiDate, formatTimeFromUTC, formatDateTimeFromUTC } from './datetime';

describe('datetime utils', () => {
  it('parses UTC timestamps without timezone as UTC', () => {
    const d = parseApiDate('2025-09-15T10:30:00');
    // Ensure it is interpreted as the same instant as with Z suffix
    const dz = parseApiDate('2025-09-15T10:30:00Z');
    expect(d.getTime()).toBe(dz.getTime());
  });

  it('respects timestamps already containing timezone', () => {
    const z = parseApiDate('2025-09-15T10:30:00Z');
    const plus2 = parseApiDate('2025-09-15T12:30:00+02:00');
    expect(plus2.getTime()).toBe(z.getTime());
  });

  it('formats time in local timezone', () => {
    const s = formatTimeFromUTC('2025-09-15T10:05:00Z', 'en-US', { hour12: false });
    expect(s).toMatch(/\d{2}:\d{2}/);
  });

  it('formats full date-time in local timezone', () => {
    const s = formatDateTimeFromUTC('2025-09-15T10:05:00Z', 'en-US');
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });
});
