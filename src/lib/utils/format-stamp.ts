// Date stamp in the style of a digital LCD clock readout.
// Format: "MMM DD, YYYY, H:MM AM/PM"  (uppercase month, full year)
// Example: "MAY 17, 2026, 12:11 PM"
const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;
export function formatStampDate(iso: string): string {
  const d = new Date(iso);
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  const h24 = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${month} ${day}, ${year}, ${h12}:${minutes} ${ampm}`;
}

/**
 * Map every alphanumeric character to `~` (which in DSEG14 lights ALL 14
 * segments) so the result, rendered behind the real text at low opacity,
 * paints the "unlit" segments — giving the authentic LCD ghost look.
 * Non-alnum (commas, colons, spaces) pass through unchanged to preserve
 * monospace alignment with the foreground layer.
 */
export function ghostifyStamp(s: string): string {
  return Array.from(s).map((c) => (/[A-Z0-9]/.test(c) ? '~' : c)).join('');
}

/**
 * Splits a formatted stamp into the month label (rendered in a pixel font)
 * and the rest (numbers, separators, AM/PM — stays in DSEG14). Format from
 * `formatStampDate` is always `MMM DD, YYYY, H:MM AM/PM`, so the month is
 * everything before the first space.
 */
export function splitStamp(s: string): { month: string; rest: string } {
  const i = s.indexOf(' ');
  if (i < 0) return { month: s, rest: '' };
  return { month: s.slice(0, i), rest: s.slice(i + 1) };
}
