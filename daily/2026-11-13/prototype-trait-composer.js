/**
 * Descriptor-Safe Prototype Trait Composer
 * ----------------------------------------
 * Compose reusable behavior into a subclass without flattening away property
 * descriptors. Supports requirements, exclusions, aliases, symbols, explicit
 * conflict resolution, and opt-in overriding of inherited prototype members.
 *
 * A trait is { name, members, requires?, excludes?, aliases? }. "members" may
 * be an object or a class (its prototype is used). Alias maps may be plain
 * objects for string keys or Maps for string/symbol keys.
 */

function composeTraits(BaseClass, traitSpecs, {
  resolve = {},
  overrideBase = false
} = {}) {
  if (typeof BaseClass !== "function") {
    throw new TypeError("BaseClass must be a constructor");
  }
  if (!Array.isArray(traitSpecs)) {
    throw new TypeError("traitSpecs must be an array");
  }

  const candidates = new Map();
  const traitNames = new Set();
  const requirements = [];

  const getAlias = (aliases, key) => {
    if (aliases instanceof Map) {
      return aliases.has(key) ? aliases.get(key) : key;
    }
    if (aliases && typeof key === "string" &&
        Object.prototype.hasOwnProperty.call(aliases, key)) {
      return aliases[key];
    }
    return key;
  };

  traitSpecs.forEach((spec, index) => {
    if (!spec || typeof spec !== "object") {
      throw new TypeError(`trait at index ${index} must be an object`);
    }
    const name = spec.name || `Trait${index + 1}`;
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError("trait names must be non-empty strings");
    }
    if (traitNames.has(name)) throw new Error(`duplicate trait name: ${name}`);
    traitNames.add(name);

    const source = typeof spec.members === "function"
      ? spec.members.prototype
      : spec.members;
    if (!source || (typeof source !== "object" && typeof source !== "function")) {
      throw new TypeError(`trait ${name} needs an object or class in members`);
    }

    const excluded = new Set(spec.excludes || []);
    requirements.push(...(spec.requires || []).map(key => ({ trait: name, key })));

    for (const originalKey of Reflect.ownKeys(source)) {
      if (originalKey === "constructor" || excluded.has(originalKey)) continue;
      const key = getAlias(spec.aliases, originalKey);
      if (key === "constructor") {
        throw new Error(`trait ${name} cannot alias a member to constructor`);
      }
      if (key === undefined || key === null) {
        throw new TypeError(`trait ${name} produced an invalid alias`);
      }

      const descriptor = Object.getOwnPropertyDescriptor(source, originalKey);
      if (!candidates.has(key)) candidates.set(key, []);
      candidates.get(key).push({ trait: name, originalKey, descriptor });
    }
  });

  const Composed = class extends BaseClass {};

  const getResolution = key => {
    if (resolve instanceof Map) {
      return resolve.has(key) ? resolve.get(key) : undefined;
    }
    if (resolve && Object.prototype.hasOwnProperty.call(resolve, key)) {
      return resolve[key];
    }
    return undefined;
  };

  for (const [key, options] of candidates) {
    let chosen;
    if (options.length === 1) {
      chosen = options[0];
    } else {
      const choice = getResolution(key);
      if (choice === "first") chosen = options[0];
      else if (choice === "last") chosen = options[options.length - 1];
      else if (typeof choice === "string") {
        chosen = options.find(candidate => candidate.trait === choice);
      }
      if (!chosen) {
        throw new Error(
          `conflicting member ${String(key)} from: ${options.map(x => x.trait).join(", ")}`
        );
      }
    }

    if (!overrideBase && key in BaseClass.prototype) {
      throw new Error(
        `trait member ${String(key)} overrides a base member; set overrideBase: true`
      );
    }
    Object.defineProperty(Composed.prototype, key, chosen.descriptor);
  }

  for (const { trait, key } of requirements) {
    if (!(key in Composed.prototype)) {
      throw new Error(`trait ${trait} requires missing member ${String(key)}`);
    }
  }

  return Composed;
}

// ------------------------------ Example tests ------------------------------
if (require.main === module) {
  const assert = require("node:assert/strict");

  class Entity {
    constructor(id) { this.id = id; }
    describe() { return `entity:${this.id}`; }
  }

  const stampSymbol = Symbol("stamp");
  const Stamp = {
    get label() { return `item-${this.id}`; },
    [stampSymbol]() { return `stamp:${this.id}`; },
    stamp() { return this.label.toUpperCase(); }
  };
  const Auditable = {
    audit() { return `audit:${this.id}`; }
  };

  const Item = composeTraits(Entity, [
    { name: "Stamp", members: Stamp, requires: ["describe"] },
    { name: "Auditable", members: Auditable }
  ]);
  const item = new Item("42");
  assert.equal(item.describe(), "entity:42");
  assert.equal(item.label, "item-42");
  assert.equal(item.stamp(), "ITEM-42");
  assert.equal(item[stampSymbol](), "stamp:42");
  assert.equal(item.audit(), "audit:42");
  assert.equal(Object.getOwnPropertyDescriptor(Item.prototype, "label").get instanceof Function, true);

  assert.throws(() => composeTraits(Object, [
    { name: "One", members: { run() { return 1; } } },
    { name: "Two", members: { run() { return 2; } } }
  ]), /conflicting member run/);

  const Resolved = composeTraits(Object, [
    { name: "One", members: { run() { return 1; } } },
    { name: "Two", members: { run() { return 2; } } }
  ], { resolve: { run: "Two" } });
  assert.equal(new Resolved().run(), 2);

  const Aliased = composeTraits(Object, [{
    name: "Legacy",
    members: { execute() { return "ok"; }, ignored() { return false; } },
    aliases: { execute: "run" },
    excludes: ["ignored"],
    requires: ["run"]
  }]);
  assert.equal(new Aliased().run(), "ok");
  assert.equal("execute" in Aliased.prototype, false);

  assert.throws(() => composeTraits(Entity, [
    { name: "Bad", members: { extra() {} }, requires: ["missing"] }
  ]), /requires missing member/);

  assert.throws(() => composeTraits(Entity, [
    { name: "Override", members: { describe() { return "other"; } } }
  ]), /overrides a base member/);

  const Override = composeTraits(Entity, [
    { name: "Override", members: { describe() { return "custom"; } } }
  ], { overrideBase: true });
  assert.equal(new Override("x").describe(), "custom");

  const symbolTrait = new Map([[stampSymbol, function () { return "mapped"; }]]);
  const SymbolClass = composeTraits(Object, [
    { name: "SymbolMap", members: Object.fromEntries(symbolTrait) }
  ]);
  assert.equal(typeof new SymbolClass()[stampSymbol], "function");

  console.log("prototype-trait-composer: all tests passed");
}

module.exports = { composeTraits };
