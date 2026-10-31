/** RFC 4122 v4 id (Web Crypto — available in browsers and Node 19+). */
export function uuidv4(): string {
  return globalThis.crypto.randomUUID();
}
