/**
 * UUID v4 — `crypto.randomUUID` gibt es nur im sicheren Kontext (https,
 * localhost); auf der http-Instanz reicht eine Zufallsfolge in derselben Form.
 */
export function neueUuid(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  const hex = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
