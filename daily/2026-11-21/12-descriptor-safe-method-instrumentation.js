// Exercise: Instrument own methods on a prototype without changing their descriptors.
// Preserve this, arguments, return values, thrown errors, and Promise behavior. Return an
// uninstall function that restores the original property descriptors exactly.

function instrumentMethods(prototype, hooks = {}) {
  if (prototype === null || typeof prototype !== "object") {
    throw new TypeError("prototype must be an object");
  }
  const before = hooks.before || (() => {});
  const after = hooks.after || (() => {});
  const onError = hooks.onError || (() => {});
  const restorations = [];

  for (const key of Reflect.ownKeys(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (!descriptor || typeof descriptor.value !== "function" || key === "constructor") continue;
    if (!descriptor.configurable && !descriptor.writable) continue;

    const original = descriptor.value;
    function wrapped(...args) {
      const context = { name: String(key), receiver: this, args };
      before(context);
      let result;
      try {
        result = Reflect.apply(original, this, args);
      } catch (error) {
        onError(error, context);
        throw error;
      }

      if (result && typeof result.then === "function") {
        return Promise.resolve(result).then(
          value => {
            after(value, context);
            return value;
          },
          error => {
            onError(error, context);
            throw error;
          }
        );
      }
      after(result, context);
      return result;
    }

    Object.defineProperty(prototype, key, { ...descriptor, value: wrapped });
    restorations.push({ key, descriptor, wrapped });
  }

  let active = true;
  return function uninstall() {
    if (!active) return;
    active = false;
    for (const item of restorations.reverse()) {
      const current = Object.getOwnPropertyDescriptor(prototype, item.key);
      if (current && current.value === item.wrapped) {
        Object.defineProperty(prototype, item.key, item.descriptor);
      }
    }
  };
}

// Tests
const assert = require("node:assert/strict");
class Counter {
  constructor(value = 0) { this.value = value; }
  increment(amount = 1) { this.value += amount; return this.value; }
  async readLater() { return this.value; }
  get doubled() { return this.value * 2; }
}
const originalDescriptor = Object.getOwnPropertyDescriptor(Counter.prototype, "increment");
const events = [];
const uninstall = instrumentMethods(Counter.prototype, {
  before: context => events.push("before:" + context.name),
  after: value => events.push("after:" + value),
  onError: error => events.push("error:" + error.message)
});
const counter = new Counter(2);
assert.equal(counter.increment(3), 5);
assert.equal(counter.doubled, 10);

(async () => {
  assert.equal(await counter.readLater(), 5);
  assert.deepEqual(events, ["before:increment", "after:5", "before:readLater", "after:5"]);
  uninstall();
  const restored = Object.getOwnPropertyDescriptor(Counter.prototype, "increment");
  assert.equal(restored.value, originalDescriptor.value);
  assert.equal(restored.enumerable, originalDescriptor.enumerable);
  assert.equal(restored.writable, originalDescriptor.writable);
  console.log("method instrumentation tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
