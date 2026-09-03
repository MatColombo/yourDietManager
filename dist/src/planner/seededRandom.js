function hash32(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class SeededRandom {
  constructor(seed) { this.state = hash32(seed) || 0x9e3779b9; }
  next() {
    let x = this.state;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
  int(maxExclusive) { return Math.floor(this.next() * maxExclusive); }
}

export function seededTie(seed, key) {
  return new SeededRandom(`${seed}|${key}`).next();
}

export function stableHashId(prefix, ...parts) {
  return `${prefix}_${hash32(parts.join('|')).toString(16).padStart(8, '0')}`;
}
