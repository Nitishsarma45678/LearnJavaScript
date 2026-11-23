// Exercise: Compose prototype-based traits without losing descriptors.
// Traits may be classes or prototype objects. Resolve duplicate property names
// with throw, first-wins, or last-wins policies. Include inherited Base members
// in conflict detection and preserve getters, setters, symbols and enumerability.
//
// Run: node 20-prototype-trait-mixin-conflicts.js
const assert = require("node:assert/strict");

function composeTraits(Base, traits, options = {}) {
  if (typeof Base !== "function" || !Array.isArray(traits)) {
    throw new TypeError("Base constructor and traits array are required");
  }
  const policy = options.conflict ?? "throw";
  if (!["throw", "first", "last"].includes(policy)) {
    throw new TypeError("conflict policy must be throw, first, or last");
  }

  class Composed extends Base {}

  for (const trait of traits) {
    const prototype = typeof trait === "function" ? trait.prototype : trait;
    if (!prototype || typeof prototype !== "object") {
      throw new TypeError("each trait must be a constructor or prototype object");
    }

    for (const key of Reflect.ownKeys(prototype)) {
      if (key === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      const conflict = key in Composed.prototype;

      if (conflict && policy === "throw") {
        throw new Error("trait property conflict: " + String(key));
      }
      if (conflict && policy === "first") continue;
      Object.defineProperty(Composed.prototype, key, descriptor);
    }
  }

  return Composed;
}

// Example tests
{
  class Base {
    save() { return "base-save"; }
    identify() { return "base"; }
  }
  class Printable {
    render() { return "print"; }
    get label() { return "printable"; }
  }
  class Auditable {
    render() { return "audit"; }
    audit() { return "recorded"; }
  }

  assert.throws(() => composeTraits(Base, [Printable, Auditable]), /render/);

  const First = composeTraits(Base, [Printable, Auditable], { conflict: "first" });
  const first = new First();
  assert.equal(first.render(), "print");
  assert.equal(first.audit(), "recorded");
  assert.equal(first.save(), "base-save");
  assert.equal(first.label, "printable");
  assert.equal(Object.getOwnPropertyDescriptor(First.prototype, "render").enumerable, false);

  const Last = composeTraits(Base, [Printable, Auditable], { conflict: "last" });
  assert.equal(new Last().render(), "audit");

  class OverrideBase {
    identify() { return "base"; }
  }
  const PreserveBase = composeTraits(OverrideBase, [class {
    identify() { return "trait"; }
  }], { conflict: "first" });
  const ReplaceBase = composeTraits(OverrideBase, [class {
    identify() { return "trait"; }
  }], { conflict: "last" });
  assert.equal(new PreserveBase().identify(), "base");
  assert.equal(new ReplaceBase().identify(), "trait");

  const marker = Symbol("marker");
  const SymbolTrait = { [marker]: function () { return 42; } };
  const WithSymbol = composeTraits(Base, [SymbolTrait]);
  assert.equal(new WithSymbol()[marker](), 42);
  assert.throws(() => composeTraits(Base, [null]), /trait/);
}
console.log("prototype trait composition tests passed");
