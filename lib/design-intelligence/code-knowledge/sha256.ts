/**
 * SHA-256 helpers for Code Knowledge deduplication / versioning.
 * Browser + Node compatible via Web Crypto when available.
 */

export async function sha256HexFromBytes(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data =
    bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes;

  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data as ArrayBuffer);
    return bufferToHex(new Uint8Array(digest));
  }

  // Node fallback (tests / server without subtle)
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  hash.update(Buffer.from(data as ArrayBuffer));
  return hash.digest("hex");
}

export async function sha256HexFromText(text: string): Promise<string> {
  return sha256HexFromBytes(new TextEncoder().encode(text));
}

function bufferToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
