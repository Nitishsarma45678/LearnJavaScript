// Exercise: Compose named traits into a prototype without mutating the base or traits.
// Duplicate members require an explicit resolution naming the winning trait.
// Property descriptors (including getters) must be preserved.
// Run: node daily/2026-11-20/11-prototype-trait-composer.js
"use strict";
const assert = require("node:assert/strict");
function composeTraits(basePrototype, traits, resolutions = {}) {
  if (basePrototype !== null && (typeof basePrototype !== "object" && typeof basePrototype !== "function")) {
    throw new TypeError("basePrototype must be an object or null");
  }
  if (!Array.isArray(traits)) throw new TypeError("traits must be an array");
  const members = new Map();
  for (const trait of traits) {
    if (!trait || typeof trait.name !== "string" || !trait.methods || typeof trait.methods !== "object") {
      throw new TypeError("each trait needs a name and methods object");
    }
    for (const key of Reflect.ownKeys(trait.methods)) {
      const entries = members.get(key) || [];
      entries.push({ traitName: trait.name, descriptor: Object.getOwnPropertyDescriptor(trait.methods, key) });
      members.set(key, entries);
    }
  }
  const composedPrototype = Object.create(basePrototype);
  for (const [key, entries] of members) {
    let selected;
    if (entries.length === 1) selected = entries[0];
    else {
      const winner = resolutions[key];
      selected = entries.find(entry => entry.traitName === winner);
      if (!selected) throw new Error("conflicting trait member: " + String(key));
    }
    Object.defineProperty(composedPrototype, key, selected.descriptor);
  }
  return Object.create(composedPrototype);
}
const base = {
  describe() { return "base"; },
  get kind() { return "entity"; }
};
const audit = { name: "audit", methods: { record() { return "recorded"; }, source: "audit" } };
const serializable = { name: "serializable", methods: { toJSON() { return { kind: this.kind }; }, source: "json" } };
const instance = composeTraits(base, [audit, serializable], { source: "audit" });
assert.equal(instance.describe(), "base");
assert.equal(instance.record(), "recorded");
assert.equal(instance.kind, "entity");
assert.deepEqual(instance.toJSON(), { kind: "entity" });
assert.equal(instance.source, "audit");
assert.equal(Object.getPrototypeOf(Object.getPrototypeOf(instance)), base);
assert.throws(() => composeTraits(base, [audit, serializable]), /conflicting/);
assert.throws(() => composeTraits(base, [{ name: "broken" }]), /methods object/);
console.log("prototype trait composer: all tests passed");
