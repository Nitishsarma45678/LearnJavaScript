/*
 * Practice: Proxy Negative-Index Array
 *
 * What: A Proxy wraps a target object and lets you intercept fundamental
 * operations (get, set, has, deleteProperty, ...) through "trap" functions.
 * Reflect provides the default behaviour for each trap, so a trap can tweak
 * one detail and forward everything else.
 *
 * Why it matters: Proxies power validation layers, observable state (Vue 3),
 * ORMs and mocking libraries. Understanding them demystifies "magic" APIs.
 *
 * Key ideas:
 *   - Property keys reach traps as strings ("-1", not -1), so we parse them.
 *   - Always forward with Reflect.* and pass `receiver` so getters/setters
 *     and inherited methods (push, map, ...) still work.
 *   - Combine concerns: negative indexing + type validation in one handler.
 */

function isIntegerKey(prop) {
  return typeof prop === "string" && /^-?\d+$/.test(prop);
}

function normalize(target, prop) {
  if (!isIntegerKey(prop)) return prop;
  const index = Number(prop);
  return index < 0 ? String(target.length + index) : prop;
}

function createSmartArray(items = [], { type } = {}) {
  const check = (value) => {
    if (type && typeof value !== type) {
      throw new TypeError(`Expected ${type}, got ${typeof value}`);
    }
  };
  items.forEach(check);

  return new Proxy([...items], {
    get(target, prop, receiver) {
      return Reflect.get(target, normalize(target, prop), receiver);
    },
    set(target, prop, value, receiver) {
      const key = normalize(target, prop);
      if (isIntegerKey(key)) {
        if (Number(key) < 0) throw new RangeError(`Index ${prop} out of range`);
        check(value);
      }
      return Reflect.set(target, key, value, receiver);
    },
    has(target, prop) {
      return Reflect.has(target, normalize(target, prop));
    },
    deleteProperty(target, prop) {
      return Reflect.deleteProperty(target, normalize(target, prop));
    },
  });
}

// ---------------------------------------------------------------------------
const assert = require("node:assert/strict");

const nums = createSmartArray([10, 20, 30, 40], { type: "number" });
assert.equal(nums[-1], 40);
assert.equal(nums[-4], 10);
assert.equal(nums[-5], undefined);
assert.equal(nums[0], 10);

nums[-1] = 99;
assert.equal(nums[3], 99);
assert.ok(-2 in nums);
assert.ok(!(-10 in nums));

// Array methods still work because we forward through Reflect with receiver
nums.push(50);
assert.equal(nums.length, 5);
assert.equal(nums[-1], 50);
assert.deepEqual(nums.map((n) => n / 10), [1, 2, 3, 9.9, 5]);
assert.ok(Array.isArray(nums));

// Validation
assert.throws(() => { nums[0] = "oops"; }, TypeError);
assert.throws(() => nums.push("x"), TypeError);
assert.throws(() => { nums[-100] = 1; }, RangeError);
assert.throws(() => createSmartArray([1, "2"], { type: "number" }), TypeError);

// Untyped arrays accept anything; delete with a negative index
const mixed = createSmartArray(["a", 1, true]);
delete mixed[-1];
assert.equal(mixed[2], undefined);
assert.equal(mixed.length, 3);

// Empty array edge case
const empty = createSmartArray();
assert.equal(empty[-1], undefined);

console.log("✓ Proxy Negative-Index Array: all checks passed");
