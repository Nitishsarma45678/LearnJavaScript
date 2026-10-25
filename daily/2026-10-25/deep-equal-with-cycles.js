/**
 * Structural equality for arrays, plain objects, Date, RegExp, and cyclic graphs.
 * Symbol and non-enumerable properties are intentionally outside this exercise's scope.
 */
function deepEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;

  if (seen.has(a)) return seen.get(a) === b;
  seen.set(a, b);

  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key], seen)) return false;
  }
  return true;
}

console.assert(deepEqual({ x: [1, { y: 2 }] }, { x: [1, { y: 2 }] }));
console.assert(!deepEqual({ x: 1 }, { x: "1" }));
const left = { name: "loop" }; left.self = left;
const right = { name: "loop" }; right.self = right;
console.assert(deepEqual(left, right));
console.assert(deepEqual(new Date("2020-01-01"), new Date("2020-01-01")));
console.assert(!deepEqual(/a/i, /a/g));
console.log("cycle-aware deep equality practice passed");
