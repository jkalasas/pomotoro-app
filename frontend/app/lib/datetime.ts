// Utilities for handling server timestamps (saved in UTC)

/**
 * Parse an API timestamp as UTC when no timezone is present.
 * If the string already includes a timezone (Z or ±HH:MM), it is respected.
 */
export function parseApiDate(timestamp: string): Date {
  if (!timestamp) return new Date(NaN);
  let ts = timestamp.trim();
  if (ts.includes('T') === false && ts.includes(' ')) {
    ts = ts.replace(' ', 'T');
  }
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(ts);
  const normalized = hasTz ? ts : `${ts}Z`;
  return new Date(normalized);
}

/**
 * Format a UTC timestamp into the user's local time string.
 */
export function formatTimeFromUTC(
  timestamp: string,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseApiDate(timestamp);
  if (isNaN(d.getTime())) return 'Invalid date';
  const fmt: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };
  return d.toLocaleTimeString(locale, fmt);
}

/**
 * Format full date-time using local timezone.
 */
export function formatDateTimeFromUTC(
  timestamp: string,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = parseApiDate(timestamp);
  if (isNaN(d.getTime())) return 'Invalid date';
  const fmt: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };
  return d.toLocaleString(locale, fmt);
}
