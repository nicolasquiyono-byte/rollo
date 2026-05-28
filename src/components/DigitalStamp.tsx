import { formatStampDate, ghostifyStamp, splitStamp } from '@/lib/utils/format-stamp';

/**
 * Two-font digital timestamp: month name in VT323 (pixel/terminal) +
 * numbers/colons/AM-PM in DSEG14 (with the unlit-segment ghost layer).
 * `size` is the pixel font-size for the DSEG14 part; the pixel month is
 * rendered slightly larger so its lowercase x-height matches the LCD chars.
 */
export function DigitalStamp({ takenAt, size }: { takenAt: string; size: number }) {
  const { month, rest } = splitStamp(formatStampDate(takenAt));
  const litShadow = [
    '0 0 1px rgba(0,0,0,0.9)',
    '0 0 4px rgba(255,107,53,0.9)',
    '0 0 10px rgba(255,107,53,0.6)',
    '0 0 18px rgba(255,107,53,0.35)',
  ].join(', ');
  return (
    <span
      className="inline-flex shrink-0 items-baseline gap-[0.35em] leading-none"
      style={{ color: '#FF6B35', fontSize: `${size}px` }}
    >
      <span
        style={{
          fontFamily: 'var(--font-pixel), ui-monospace, monospace',
          fontSize: `${size * 1.5}px`,
          textShadow: litShadow,
        }}
      >
        {month}
      </span>
      <span
        className="relative tracking-tight"
        style={{ fontFamily: '"DSEG14Classic", ui-monospace, monospace' }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ opacity: 0.32, textShadow: '0 0 2px rgba(255,107,53,0.5)' }}
        >
          {ghostifyStamp(rest)}
        </span>
        <span style={{ textShadow: litShadow }}>{rest}</span>
      </span>
    </span>
  );
}
