"use strict";

const assert = require("node:assert/strict");

function isPropertyKey(value) {
  return typeof value === "string" || typeof value === "symbol";
}

function findAlias(aliases, traitName, key) {
  for (const alias of aliases) {
    if (alias.trait === traitName && alias.key === key) return alias.as;
  }
  return key;
}

function conflictChoice(resolve, key) {
  if (resolve instanceof Map) return resolve.get(key);
  if (
    resolve &&
    typeof key === "string" &&
    Object.prototype.hasOwnProperty.call(resolve, key)
  ) return resolve[key];
  return undefined;
}

/**
 * Compose descriptor-based JavaScript traits into a real subclass.
 *
 * A trait is { name, members, requires?, excludes? }. Members are read with
 * Reflect.ownKeys and their original property descriptors are preserved.
 * Conflicting keys require an explicit trait name in the resolve option.
 * Aliases rename a member contributed by one named trait.
 *
 * Trait methods use the composed instance as this. This utility intentionally
 * does not emulate lexical super; shared behavior should be delegated through
 * ordinary instance methods or explicit helper functions.
 */
function composeTraits(Base, traits, {
  resolve = {},
  aliases = []
} = {}) {
  if (typeof Base !== "function") throw new TypeError("Base must be a constructor");
  if (!Array.isArray(traits)) throw new TypeError("traits must be an array");
  if (!Array.isArray(aliases)) throw new TypeError("aliases must be an array");

  const names = new Set();
  for (const trait of traits) {
    if (!trait || typeof trait !== "object") {
      throw new TypeError("each trait must be an object");
    }
    if (typeof trait.name !== "string" || trait.name.length === 0) {
      throw new TypeError("every trait needs a non-empty name");
    }
    if (names.has(trait.name)) throw new Error("duplicate trait name: " + trait.name);
    names.add(trait.name);
    if (!trait.members || typeof trait.members !== "object") {
      throw new TypeError("trait " + trait.name + " needs a members object");
    }
  }

  for (const trait of traits) {
    for (const excluded of trait.excludes || []) {
      if (names.has(excluded)) {
        throw new Error(
          "trait " + trait.name + " excludes selected trait " + excluded
        );
      }
    }
  }

  const contributions = new Map();

  for (const trait of traits) {
    for (const key of Reflect.ownKeys(trait.members)) {
      if (key === "constructor") continue;

      const targetKey = findAlias(aliases, trait.name, key);
      if (!isPropertyKey(targetKey) || targetKey === "constructor") {
        throw new TypeError("an alias must map to a non-constructor property key");
      }

      const descriptor = Object.getOwnPropertyDescriptor(trait.members, key);
      if (!descriptor) continue;

      if (!contributions.has(targetKey)) contributions.set(targetKey, []);
      contributions.get(targetKey).push({
        traitName: trait.name,
        descriptor
      });
    }
  }

  for (const trait of traits) {
    for (const requiredKey of trait.requires || []) {
      if (!isPropertyKey(requiredKey)) {
        throw new TypeError("trait requirements must be property keys");
      }
      if (!(requiredKey in Base.prototype) && !contributions.has(requiredKey)) {
        throw new Error(
          "trait " + trait.name + " requires missing member " + String(requiredKey)
        );
      }
    }
  }

  const selected = new Map();
  for (const [key, candidates] of contributions) {
    if (candidates.length === 1) {
      selected.set(key, candidates[0].descriptor);
      continue;
    }

    const chosenName = conflictChoice(resolve, key);
    if (typeof chosenName !== "string") {
      throw new Error(
        "member conflict for " + String(key) +
        "; resolve it by selecting one contributing trait"
      );
    }

    const chosen = candidates.find(candidate => candidate.traitName === chosenName);
    if (!chosen) {
      throw new Error(
        "trait " + chosenName + " does not contribute member " + String(key)
      );
    }
    selected.set(key, chosen.descriptor);
  }

  class Composed extends Base {}

  for (const [key, descriptor] of selected) {
    Object.defineProperty(Composed.prototype, key, descriptor);
  }

  Object.defineProperty(Composed, "traitNames", {
    value: Object.freeze(traits.map(trait => trait.name)),
    enumerable: false,
    writable: false,
    configurable: false
  });

  return Composed;
}

function runTests() {
  class Base {
    constructor(id) {
      this.id = id;
      this._secret = "s-" + id;
    }

    identity() {
      return "base:" + this.id;
    }
  }

  const symbolKey = Symbol("diagnostic");
  const accessors = {};
  Object.defineProperty(accessors, "secret", {
    get() {
      return this._secret;
    },
    enumerable: false,
    configurable: true
  });

  const Combined = composeTraits(Base, [
    {
      name: "NeedsIdentity",
      requires: ["id", "identity"],
      members: {
        label() {
          return "item-" + this.id;
        }
      }
    },
    {
      name: "Diagnostics",
      members: {
        ...accessors,
        [symbolKey]() {
          return "diagnostic:" + this.id;
        }
      }
    }
  ]);

  const instance = new Combined("42");
  assert.ok(instance instanceof Base);
  assert.equal(instance.identity(), "base:42");
  assert.equal(instance.label(), "item-42");
  assert.equal(instance.secret, "s-42");
  assert.equal(instance[symbolKey](), "diagnostic:42");
  assert.equal(
    Object.getOwnPropertyDescriptor(Combined.prototype, "secret").enumerable,
    false
  );
  assert.deepEqual(Combined.traitNames, ["NeedsIdentity", "Diagnostics"]);

  const Resolved = composeTraits(Base, [
    { name: "JSON", members: { format() { return "json"; } } },
    { name: "CSV", members: { format() { return "csv"; } } }
  ], {
    resolve: { format: "JSON" }
  });
  assert.equal(new Resolved(1).format(), "json");

  assert.throws(
    () => composeTraits(Base, [
      { name: "A", members: { format() {} } },
      { name: "B", members: { format() {} } }
    ]),
    /member conflict/
  );

  const Aliased = composeTraits(Base, [
    { name: "Inspector", members: { inspect() { return this.identity(); } } }
  ], {
    aliases: [{ trait: "Inspector", key: "inspect", as: "debugInspect" }]
  });
  const inspected = new Aliased(7);
  assert.equal(inspected.debugInspect(), "base:7");
  assert.equal("inspect" in inspected, false);

  assert.throws(
    () => composeTraits(Base, [
      { name: "NeedsCache", requires: ["cache"], members: { run() {} } }
    ]),
    /requires missing/
  );
  assert.throws(
    () => composeTraits(Base, [
      { name: "Encrypted", excludes: ["Plain"], members: { read() {} } },
      { name: "Plain", members: { read() {} } }
    ]),
    /excludes/
  );
  assert.throws(
    () => composeTraits(Base, [
      { name: "A", members: {} },
      { name: "B", members: {} }
    ], { resolve: { missing: "A" } }),
    error => error instanceof Error && !/missing/.test(error.message)
  );
}

if (require.main === module) {
  runTests();
  console.log("composeTraits: all tests passed");
}

module.exports = { composeTraits };
