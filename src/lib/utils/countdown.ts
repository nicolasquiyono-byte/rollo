export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  done: boolean;
}

export function diffParts(target: Date | string, from: Date = new Date()): CountdownParts {
  const targetMs = typeof target === 'string' ? new Date(target).getTime() : target.getTime();
  const totalMs = Math.max(0, targetMs - from.getTime());
  const seconds = Math.floor(totalMs / 1000) % 60;
  const minutes = Math.floor(totalMs / 1000 / 60) % 60;
  const hours = Math.floor(totalMs / 1000 / 60 / 60) % 24;
  const days = Math.floor(totalMs / 1000 / 60 / 60 / 24);
  return { days, hours, minutes, seconds, totalMs, done: totalMs === 0 };
}

export function formatCountdown(parts: CountdownParts, labels = { days: 'd', hours: 'h', minutes: 'm', seconds: 's' }) {
  if (parts.days > 0) return `${parts.days}${labels.days} ${parts.hours}${labels.hours}`;
  if (parts.hours > 0) return `${parts.hours}${labels.hours} ${parts.minutes}${labels.minutes}`;
  return `${parts.minutes}${labels.minutes} ${parts.seconds}${labels.seconds}`;
}
