import QRCode from 'qrcode';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateEventCode(length = 6): string {
  let code = '';
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  for (const byte of buf) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

export function eventJoinUrl(code: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? '');
  return `${base}/unirse?code=${code}`;
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#0a0a0a', light: '#ffffff' },
  });
}
