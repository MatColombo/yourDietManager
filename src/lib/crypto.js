const encoder = new TextEncoder();
function toHex(buffer) { return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(''); }

export function canonicalJson(value) {
  const normalize = input => {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw new Error('Canonical JSON does not support non-finite numbers');
      return Object.is(input, -0) ? 0 : input;
    }
    if (Array.isArray(input)) return input.map(normalize);
    if (typeof input === 'object') {
      const out = {};
      for (const key of Object.keys(input).sort()) {
        if (input[key] === undefined) continue;
        out[key] = normalize(input[key]);
      }
      return out;
    }
    throw new Error(`Canonical JSON does not support ${typeof input}`);
  };
  return JSON.stringify(normalize(value));
}

export async function sha256Text(text, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Web Crypto SHA-256 is not available');
  return toHex(await subtle.digest('SHA-256', encoder.encode(text)));
}
export async function sha256Json(value, subtle = globalThis.crypto?.subtle) { return sha256Text(canonicalJson(value), subtle); }
