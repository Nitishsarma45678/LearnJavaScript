const assert = require('node:assert/strict');

function deepEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a,b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  let paired = seen.get(a);
  if (paired) return paired === b;
  seen.set(a,b);
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  if (a instanceof Map || a instanceof Set) {
    if (a.size !== b.size) return false;
    const left = [...a], right = [...b];
    return left.every((v,i) => deepEqual(v,right[i],seen));
  }
  const ka = Reflect.ownKeys(a), kb = Reflect.ownKeys(b);
  if (ka.length !== kb.length || ka.some(k => !Object.hasOwn(b,k))) return false;
  return ka.every(k => deepEqual(a[k],b[k],seen));
}
const x = {name:'x'}; x.self=x;
const y = {name:'x'}; y.self=y;
assert.equal(deepEqual(x,y), true);
assert.equal(deepEqual({a:[1,2]}, {a:[1,2]}), true);
assert.equal(deepEqual({a:1}, {a:2}), false);
assert.equal(deepEqual(new Date(0), new Date(0)), true);
console.log('Cycle-safe deep equality tests passed');