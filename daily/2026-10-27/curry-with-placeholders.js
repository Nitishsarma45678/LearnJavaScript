// Exercise: Implement arity-aware currying with a placeholder that can be
// filled by arguments supplied in later calls.
//
// Example:
// const join3 = curryN((a, b, c) => [a, b, c].join("-"), 3);
// join3("A", curryN.placeholder, "C")("B") === "A-B-C";

"use strict";

function curryN(fn, arity = fn.length, placeholder = curryN.placeholder) {
  if (typeof fn !== "function") throw new TypeError("fn must be a function");
  if (!Number.isInteger(arity) || arity < 0) {
    throw new RangeError("arity must be a non-negative integer");
  }

  function collect(collected) {
    return function curried(...incoming) {
      const merged = collected.slice();
      let nextIndex = 0;

      for (let i = 0; i < merged.length && nextIndex < incoming.length; i += 1) {
        if (merged[i] === placeholder) {
          merged[i] = incoming[nextIndex];
          nextIndex += 1;
        }
      }
      while (nextIndex < incoming.length) {
        merged.push(incoming[nextIndex]);
        nextIndex += 1;
      }

      const firstArity = merged.slice(0, arity);
      const ready = firstArity.length === arity &&
        firstArity.every((value) => value !== placeholder);

      if (ready) return Reflect.apply(fn, this, firstArity);
      return collect(merged);
    };
  }

  return collect([]);
}

curryN.placeholder = Symbol("curryN.placeholder");
module.exports = { curryN };

if (require.main === module) {
  const assert = require("node:assert/strict");
  const _ = curryN.placeholder;
  const join3 = curryN((a, b, c) => [a, b, c].join("-"), 3);

  assert.equal(join3("A")("B")("C"), "A-B-C");
  assert.equal(join3("A", _, "C")("B"), "A-B-C");
  assert.equal(join3(_, "B")("A", "C"), "A-B-C");
  assert.equal(join3("A", _, _)(_, "C")("B"), "A-B-C");

  const multiply = curryN(function (a, b) { return this.factor * a * b; }, 2);
  assert.equal(multiply.call({ factor: 3 }, 4).call({ factor: 2 }, 5), 40);
  assert.throws(() => curryN(null), TypeError);
  assert.throws(() => curryN((x) => x, -1), RangeError);
  console.log("curry-with-placeholders: all tests passed");
}
