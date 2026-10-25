/**
 * Flatten nested arrays while detecting cycles in the active traversal path.
 * Shared subarrays are allowed and flattened each time they appear.
 */
function deepFlatten(input) {
  if (!Array.isArray(input)) throw new TypeError("input must be an array");
  const result = [];
  const active = new WeakSet();

  function visit(value) {
    if (!Array.isArray(value)) { result.push(value); return; }
    if (active.has(value)) throw new TypeError("Circular array reference detected");
    active.add(value);
    for (const item of value) visit(item);
    active.delete(value);
  }

  visit(input);
  return result;
}

console.assert(JSON.stringify(deepFlatten([1, [2, [3]], 4])) === "[1,2,3,4]");
const shared = [2, 3];
console.assert(JSON.stringify(deepFlatten([shared, shared])) === "[2,3,2,3]");
const cyclic = [1]; cyclic.push(cyclic);
try { deepFlatten(cyclic); throw new Error("Expected cycle error"); }
catch (error) { console.assert(error.message === "Circular array reference detected"); }
console.log("deep flatten practice passed");
