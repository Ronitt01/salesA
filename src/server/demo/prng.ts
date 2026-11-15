/**
 * Small seeded pseudo-random generator so the demo dataset is reproducible.
 * Not for security use.
 */

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
  /** Deterministic RFC 4122 version-4-shaped UUID. */
  uuid(): string;
}

export function createRng(seed: string): Rng {
  let a = hashSeed(seed);

  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;

  const hex = (length: number) => {
    let out = "";
    for (let i = 0; i < length; i++) out += Math.floor(next() * 16).toString(16);
    return out;
  };

  return {
    next,
    int,
    pick: (items) => items[int(0, items.length - 1)],
    chance: (probability) => next() < probability,
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    uuid: () => `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[int(0, 3)]}${hex(3)}-${hex(12)}`,
  };
}
