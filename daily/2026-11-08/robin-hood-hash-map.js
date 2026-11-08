"use strict";

const assert = require("node:assert/strict");

function sameValueZero(a, b) {
  return a === b || (a !== a && b !== b);
}

function hashToken(token) {
  // FNV-1a over UTF-16 code units; identity tokens are assigned by the map.
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Robin Hood open-addressing hash map.
 *
 * Entries with a larger probe distance may displace entries closer to their
 * ideal bucket. Lookup can stop as soon as the resident probe distance is
 * smaller than the search distance. Deletion uses backward shifting, so no
 * tombstones accumulate.
 *
 * Primitive keys use type-tagged hashes; objects/functions and symbols use
 * stable per-instance identity IDs. Equality follows Map's SameValueZero rule.
 */
class RobinHoodHashMap {
  constructor(initialCapacity = 16) {
    if (!Number.isInteger(initialCapacity) || initialCapacity < 1) {
      throw new RangeError("initialCapacity must be a positive integer");
    }

    let capacity = 4;
    while (capacity < initialCapacity) capacity *= 2;

    this._minimumCapacity = capacity;
    this._slots = new Array(capacity);
    this._size = 0;
    this._modCount = 0;
    this._objectIds = new WeakMap();
    this._symbolIds = new Map();
    this._nextIdentity = 1;
  }

  get size() {
    return this._size;
  }

  get capacity() {
    return this._slots.length;
  }

  get loadFactor() {
    return this._size / this._slots.length;
  }

  _identityId(key, store) {
    let id = store.get(key);
    if (id === undefined) {
      id = this._nextIdentity++;
      store.set(key, id);
    }
    return id;
  }

  _hashKey(key) {
    let token;
    if (key === null) {
      token = "null";
    } else {
      switch (typeof key) {
        case "undefined":
          token = "undefined";
          break;
        case "boolean":
          token = "boolean:" + key;
          break;
        case "number":
          token = Number.isNaN(key)
            ? "number:NaN"
            : "number:" + (key === 0 ? "0" : String(key));
          break;
        case "bigint":
          token = "bigint:" + String(key);
          break;
        case "string":
          token = "string:" + key;
          break;
        case "symbol":
          token = "symbol:" + this._identityId(key, this._symbolIds);
          break;
        case "object":
        case "function":
          token = "object:" + this._identityId(key, this._objectIds);
          break;
        default:
          throw new TypeError("unsupported key type");
      }
    }
    return hashToken(token);
  }

  _findIndex(key, hash) {
    const mask = this._slots.length - 1;
    let index = hash & mask;
    let distance = 0;

    while (true) {
      const slot = this._slots[index];
      if (!slot || slot.distance < distance) return -1;
      if (slot.hash === hash && sameValueZero(slot.key, key)) return index;
      index = (index + 1) & mask;
      distance++;
    }
  }

  _insertEntry(entry) {
    const mask = this._slots.length - 1;
    let index = entry.hash & mask;
    entry.distance = 0;

    while (true) {
      const resident = this._slots[index];
      if (!resident) {
        this._slots[index] = entry;
        return;
      }

      if (resident.distance < entry.distance) {
        this._slots[index] = entry;
        entry = resident;
      }

      index = (index + 1) & mask;
      entry.distance++;
    }
  }

  _resize(newCapacity) {
    const oldSlots = this._slots;
    this._slots = new Array(newCapacity);
    for (const entry of oldSlots) {
      if (entry) this._insertEntry({ ...entry, distance: 0 });
    }
  }

  set(key, value) {
    const hash = this._hashKey(key);
    const existing = this._findIndex(key, hash);

    if (existing !== -1) {
      this._slots[existing].value = value;
      this._modCount++;
      return this;
    }

    if ((this._size + 1) / this._slots.length > 0.78) {
      this._resize(this._slots.length * 2);
    }

    this._insertEntry({ key, value, hash, distance: 0 });
    this._size++;
    this._modCount++;
    return this;
  }

  get(key) {
    const index = this._findIndex(key, this._hashKey(key));
    return index === -1 ? undefined : this._slots[index].value;
  }

  has(key) {
    return this._findIndex(key, this._hashKey(key)) !== -1;
  }

  delete(key) {
    let index = this._findIndex(key, this._hashKey(key));
    if (index === -1) return false;

    const mask = this._slots.length - 1;
    let next = (index + 1) & mask;

    while (this._slots[next] && this._slots[next].distance > 0) {
      const moved = this._slots[next];
      this._slots[index] = { ...moved, distance: moved.distance - 1 };
      index = next;
      next = (next + 1) & mask;
    }

    this._slots[index] = undefined;
    this._size--;
    this._modCount++;

    if (
      this._slots.length > this._minimumCapacity &&
      this._size / this._slots.length < 0.18
    ) {
      this._resize(Math.max(this._minimumCapacity, this._slots.length / 2));
    }
    return true;
  }

  clear() {
    if (this._size === 0) return;
    this._slots = new Array(this._minimumCapacity);
    this._size = 0;
    this._modCount++;
  }

  entries() {
    const map = this;
    const expectedModCount = map._modCount;
    let index = 0;

    return {
      next() {
        if (expectedModCount !== map._modCount) {
          throw new Error("RobinHoodHashMap changed during iteration");
        }
        while (index < map._slots.length) {
          const entry = map._slots[index++];
          if (entry) {
            return { value: [entry.key, entry.value], done: false };
          }
        }
        return { value: undefined, done: true };
      },
      [Symbol.iterator]() {
        return this;
      }
    };
  }

  keys() {
    const entries = this.entries();
    return {
      next() {
        const result = entries.next();
        return result.done
          ? result
          : { value: result.value[0], done: false };
      },
      [Symbol.iterator]() {
        return this;
      }
    };
  }

  values() {
    const entries = this.entries();
    return {
      next() {
        const result = entries.next();
        return result.done
          ? result
          : { value: result.value[1], done: false };
      },
      [Symbol.iterator]() {
        return this;
      }
    };
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  forEach(callback, thisArg) {
    if (typeof callback !== "function") throw new TypeError("callback must be a function");
    const expectedModCount = this._modCount;

    for (let i = 0; i < this._slots.length; i++) {
      if (expectedModCount !== this._modCount) {
        throw new Error("RobinHoodHashMap changed during iteration");
      }
      const entry = this._slots[i];
      if (entry) callback.call(thisArg, entry.value, entry.key, this);
    }

    if (expectedModCount !== this._modCount) {
      throw new Error("RobinHoodHashMap changed during iteration");
    }
  }
}

function runTests() {
  const map = new RobinHoodHashMap(4);
  const reference = new Map();
  const objectA = {};
  const objectB = {};
  const symbolA = Symbol("same-description");
  const symbolB = Symbol("same-description");
  const keys = [
    "alpha", "beta", "gamma", "delta", "epsilon",
    0, -0, 1, -1, 3.5, NaN, Infinity,
    true, false, null, undefined, 17n,
    objectA, objectB, symbolA, symbolB
  ];

  let seed = 0x31415926;
  const random = max => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed % max;
  };

  for (let step = 0; step < 5000; step++) {
    const key = keys[random(keys.length)];
    const operation = random(4);

    if (operation <= 1) {
      const value = random(10000) === 0 ? undefined : random(100000);
      map.set(key, value);
      reference.set(key, value);
    } else if (operation === 2) {
      assert.equal(map.delete(key), reference.delete(key));
    } else {
      assert.equal(map.has(key), reference.has(key));
      assert.equal(map.get(key), reference.get(key));
    }

    assert.equal(map.size, reference.size);
    for (const candidate of keys) {
      assert.equal(map.has(candidate), reference.has(candidate));
      if (reference.has(candidate)) {
        assert.equal(map.get(candidate), reference.get(candidate));
      }
    }
  }

  for (let i = 0; i < 200; i++) map.set("cluster-" + i, i);
  for (let i = 0; i < 200; i += 2) assert.equal(map.delete("cluster-" + i), true);
  for (let i = 1; i < 200; i += 2) assert.equal(map.get("cluster-" + i), i);

  const visited = [];
  map.forEach((value, key) => visited.push([key, value]));
  assert.equal(visited.length, map.size);
  assert.equal([...map.keys()].length, map.size);
  assert.equal([...map.values()].length, map.size);

  const iterator = map.entries();
  assert.equal(iterator.next().done, false);
  map.set("mutation-check", true);
  assert.throws(() => iterator.next(), /changed during iteration/);

  map.clear();
  assert.equal(map.size, 0);
  assert.equal(map.capacity, 4);
  assert.equal(map.has("alpha"), false);

  const example = new RobinHoodHashMap();
  example.set("course", "JavaScript").set("level", "advanced");
  assert.equal(example.get("course"), "JavaScript");
  assert.equal(example.delete("level"), true);
  assert.equal(example.has("level"), false);
}

if (require.main === module) {
  runTests();
  console.log("RobinHoodHashMap: all tests passed");
}

module.exports = { RobinHoodHashMap };
