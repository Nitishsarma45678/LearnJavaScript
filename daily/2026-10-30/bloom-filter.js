/*
 * Bloom filter for strings, using double hashing and a Uint32Array bitset.
 * False positives are possible; false negatives are not.
 */
function hashPair(value) {
  let h1 = 2166136261, h2 = 0x9e3779b9;
  for (const character of value) {
    const cp = character.codePointAt(0);
    h1 = Math.imul(h1 ^ cp, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ cp, 2246822519) >>> 0;
  }
  return [h1, (h2 | 1) >>> 0];
}
class BloomFilter {
  constructor(bitCount, hashCount) {
    if (!Number.isInteger(bitCount) || bitCount < 1 || bitCount > 2147483647) {
      throw new RangeError("bitCount must be from 1 to 2^31 - 1");
    }
    if (!Number.isInteger(hashCount) || hashCount < 1 || hashCount > 32) {
      throw new RangeError("hashCount must be from 1 to 32");
    }
    this.bitCount = bitCount;
    this.hashCount = hashCount;
    this.bits = new Uint32Array(Math.ceil(bitCount / 32));
    this.insertedCount = 0;
  }
  static optimal(expectedItems, falsePositiveRate) {
    if (!Number.isInteger(expectedItems) || expectedItems < 1) {
      throw new RangeError("expectedItems must be a positive integer");
    }
    if (typeof falsePositiveRate !== "number" ||
        falsePositiveRate <= 0 || falsePositiveRate >= 1) {
      throw new RangeError("falsePositiveRate must be between 0 and 1");
    }
    const ln2 = Math.log(2);
    const bitCount = Math.ceil(
      -expectedItems * Math.log(falsePositiveRate) / (ln2 * ln2)
    );
    if (bitCount > 2147483647) throw new RangeError("requested filter is too large");
    const hashCount = Math.max(1, Math.min(32, Math.round(bitCount / expectedItems * ln2)));
    return { bitCount, hashCount };
  }
  _positions(value) {
    if (typeof value !== "string") throw new TypeError("values must be strings");
    const [h1, h2] = hashPair(value), positions = [];
    for (let i = 0; i < this.hashCount; i++) {
      positions.push((h1 + i * h2) % this.bitCount);
    }
    return positions;
  }
  add(value) {
    for (const p of this._positions(value)) {
      const word = Math.floor(p / 32), mask = 1 << (p % 32);
      this.bits[word] = (this.bits[word] | mask) >>> 0;
    }
    this.insertedCount++;
    return this;
  }
  has(value) {
    return this._positions(value).every(p => {
      const word = Math.floor(p / 32), mask = 1 << (p % 32);
      return (this.bits[word] & mask) !== 0;
    });
  }
  estimatedFalsePositiveRate(count = this.insertedCount) {
    if (typeof count !== "number" || !Number.isFinite(count) || count < 0) {
      throw new RangeError("count must be a non-negative finite number");
    }
    const occupied = 1 - Math.exp(-this.hashCount * count / this.bitCount);
    return Math.pow(occupied, this.hashCount);
  }
  serialize() {
    return {
      version: 1, bitCount: this.bitCount, hashCount: this.hashCount,
      insertedCount: this.insertedCount,
      bits: Array.from(this.bits, word => word >>> 0)
    };
  }
  static deserialize(data) {
    if (!data || data.version !== 1 || !Array.isArray(data.bits)) {
      throw new TypeError("invalid Bloom filter snapshot");
    }
    const filter = new BloomFilter(data.bitCount, data.hashCount);
    if (data.bits.length !== filter.bits.length) throw new RangeError("bitset length mismatch");
    if (!Number.isInteger(data.insertedCount) || data.insertedCount < 0) {
      throw new RangeError("invalid insertedCount");
    }
    data.bits.forEach((word, i) => {
      if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) {
        throw new RangeError("invalid bitset word");
      }
      filter.bits[i] = word;
    });
    filter.insertedCount = data.insertedCount;
    return filter;
  }
}
function assert(ok, message) { if (!ok) throw new Error(message || "assertion failed"); }
async function runTests() {
  const filter = new BloomFilter(4096, 5);
  const words = ["alpha", "beta", "gamma", "delta", "😀"];
  words.forEach(word => filter.add(word));
  words.forEach(word => assert(filter.has(word), "false negative for " + word));
  assert(filter.insertedCount === words.length);
  const rate = filter.estimatedFalsePositiveRate();
  assert(rate > 0 && rate < 1);
  const restored = BloomFilter.deserialize(JSON.parse(JSON.stringify(filter.serialize())));
  words.forEach(word => assert(restored.has(word), "serialization lost " + word));
  assert(restored.insertedCount === words.length);
  const sizing = BloomFilter.optimal(10000, 0.01);
  assert(sizing.bitCount > 0 && sizing.hashCount >= 1 && sizing.hashCount <= 32);
  assert(new BloomFilter(8, 1).estimatedFalsePositiveRate(0) === 0);
  let threw = false;
  try { filter.add(42); } catch (e) { threw = e instanceof TypeError; }
  assert(threw);
}
if (typeof module !== "undefined" && require.main === module) {
  runTests().then(() => console.log("bloom-filter: tests passed"))
    .catch(e => { console.error(e); process.exitCode = 1; });
}
