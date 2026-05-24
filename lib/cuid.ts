// Simple cuid-compatible ID generator using crypto
export function createId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 20);
  return `c${timestamp}${randomPart}`;
}
