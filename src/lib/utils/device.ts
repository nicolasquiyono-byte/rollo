const DEVICE_KEY = 'rollo:device-id';
const NAME_KEY = 'rollo:guest-name';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getGuestName(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(NAME_KEY);
}

export function setGuestName(name: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NAME_KEY, name);
}
