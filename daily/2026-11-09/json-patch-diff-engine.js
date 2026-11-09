/**
 * JSON Diff and Patch Engine
 * -------------------------
 * Produce deterministic JSON Patch add/remove/replace operations. Object
 * changes are recursive; array changes use an LCS edit script so insertions
 * and removals do not degrade into replacing the entire array.
 *
 * Supported values are finite JSON primitives, dense arrays, and plain
 * objects. Move/copy/test operations and root removal are intentionally out
 * of scope. Applying a patch never mutates the input document.
 *
 * Run: node json-patch-diff-engine.js
 */

"use strict";

function validateJson(value, seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JSON numbers must be finite");
    return;
  }
  if (typeof value !== "object") throw new TypeError("Value is not JSON-compatible");
  if (seen.has(value)) throw new TypeError("Cyclic values are not supported");
  seen.add(value);

  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== value.length + 1) throw new TypeError("Arrays must not have extra properties");
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) throw new TypeError("Sparse arrays are not supported");
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        throw new TypeError("Array accessors are not supported");
      }
      validateJson(descriptor.value, seen);
    }
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Only plain objects are supported");
    }
    const ownKeys = Reflect.ownKeys(value);
    const enumerableKeys = Object.keys(value);
    if (ownKeys.length !== enumerableKeys.length) {
      throw new TypeError("Symbol and non-enumerable properties are not supported");
    }
    for (const key of enumerableKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        throw new TypeError("Object accessors are not supported");
      }
      validateJson(descriptor.value, seen);
    }
  }

  seen.delete(value);
}

function cloneJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  const copy = {};
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: cloneJson(value[key]),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return copy;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (!deepEqual(left[i], right[i])) return false;
    }
    return true;
  }
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let i = 0; i < leftKeys.length; i++) {
    if (leftKeys[i] !== rightKeys[i] || !deepEqual(left[leftKeys[i]], right[rightKeys[i]])) return false;
  }
  return true;
}

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

function childPath(parent, segment) {
  return parent + "/" + escapePointerSegment(segment);
}

function diffJson(before, after, options = {}) {
  validateJson(before);
  validateJson(after);
  const maxArrayCells = options.maxArrayCells ?? 250000;
  if (!Number.isSafeInteger(maxArrayCells) || maxArrayCells < 1) {
    throw new RangeError("maxArrayCells must be a positive safe integer");
  }

  const operations = [];

  function diffValue(left, right, path) {
    if (deepEqual(left, right)) return;

    if (Array.isArray(left) && Array.isArray(right)) {
      diffArray(left, right, path);
      return;
    }

    if (isPlainObject(left) && isPlainObject(right)) {
      const leftKeys = Object.keys(left).sort();
      const rightKeys = Object.keys(right).sort();
      const rightSet = new Set(rightKeys);
      const leftSet = new Set(leftKeys);

      for (const key of leftKeys) {
        if (!rightSet.has(key)) operations.push({ op: "remove", path: childPath(path, key) });
      }
      for (const key of leftKeys) {
        if (rightSet.has(key)) diffValue(left[key], right[key], childPath(path, key));
      }
      for (const key of rightKeys) {
        if (!leftSet.has(key)) {
          operations.push({ op: "add", path: childPath(path, key), value: cloneJson(right[key]) });
        }
      }
      return;
    }

    operations.push({ op: "replace", path, value: cloneJson(right) });
  }

  function diffArray(left, right, path) {
    const n = left.length;
    const m = right.length;
    if (n * m > maxArrayCells) {
      throw new RangeError("Array LCS exceeds maxArrayCells; increase the configured limit");
    }

    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = deepEqual(left[i], right[j])
          ? 1 + lcs[i + 1][j + 1]
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }

    let i = 0;
    let j = 0;
    let index = 0;
    while (i < n || j < m) {
      if (i < n && j < m && deepEqual(left[i], right[j])) {
        i++;
        j++;
        index++;
      } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
        operations.push({
          op: "add",
          path: childPath(path, index),
          value: cloneJson(right[j])
        });
        j++;
        index++;
      } else {
        operations.push({ op: "remove", path: childPath(path, index) });
        i++;
      }
    }
  }

  diffValue(before, after, "");
  return operations;
}

function decodePointerSegment(segment) {
  if (/~(?![01])/.test(segment)) throw new SyntaxError("Invalid JSON Pointer escape: " + segment);
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parsePointer(pointer) {
  if (pointer === "") return [];
  if (typeof pointer !== "string" || pointer[0] !== "/") {
    throw new SyntaxError("A JSON Pointer must be empty or begin with '/'");
  }
  return pointer.slice(1).split("/").map(decodePointerSegment);
}

function arrayIndex(segment, length, allowAppend) {
  if (allowAppend && segment === "-") return length;
  if (!/^(0|[1-9]\d*)$/.test(segment)) throw new SyntaxError("Invalid array index: " + segment);
  const index = Number(segment);
  if (!Number.isSafeInteger(index) || index > length || (!allowAppend && index === length)) {
    throw new RangeError("Array index out of bounds: " + segment);
  }
  return index;
}

function getParent(root, segments) {
  let parent = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (Array.isArray(parent)) {
      const index = arrayIndex(key, parent.length, false);
      parent = parent[index];
    } else if (parent !== null && typeof parent === "object" &&
               Object.prototype.hasOwnProperty.call(parent, key)) {
      parent = parent[key];
    } else {
      throw new RangeError("Patch path does not exist at segment: " + key);
    }
  }
  return { parent, key: segments[segments.length - 1] };
}

function applyPatch(document, operations) {
  validateJson(document);
  if (!Array.isArray(operations)) throw new TypeError("Patch must be an array");
  let result = cloneJson(document);

  for (const operation of operations) {
    if (!operation || typeof operation !== "object" ||
        !["add", "remove", "replace"].includes(operation.op) ||
        typeof operation.path !== "string") {
      throw new TypeError("Only add, remove, and replace operations are supported");
    }
    const segments = parsePointer(operation.path);
    const needsValue = operation.op !== "remove";
    if (needsValue) {
      if (!Object.prototype.hasOwnProperty.call(operation, "value")) {
        throw new TypeError(operation.op + " operation requires a value");
      }
      validateJson(operation.value);
    }

    if (segments.length === 0) {
      if (operation.op === "remove") throw new RangeError("Removing the document root is not supported");
      result = cloneJson(operation.value);
      continue;
    }

    const { parent, key } = getParent(result, segments);
    if (Array.isArray(parent)) {
      if (operation.op === "add") {
        parent.splice(arrayIndex(key, parent.length, true), 0, cloneJson(operation.value));
      } else {
        const index = arrayIndex(key, parent.length, false);
        if (operation.op === "remove") parent.splice(index, 1);
        else parent[index] = cloneJson(operation.value);
      }
    } else if (parent !== null && typeof parent === "object") {
      const exists = Object.prototype.hasOwnProperty.call(parent, key);
      if (operation.op !== "add" && !exists) {
        throw new RangeError("Object property does not exist: " + key);
      }
      if (operation.op === "remove") delete parent[key];
      else {
        Object.defineProperty(parent, key, {
          value: cloneJson(operation.value),
          enumerable: true,
          configurable: true,
          writable: true
        });
      }
    } else {
      throw new TypeError("Patch parent must be an object or array");
    }
  }

  validateJson(result);
  return result;
}

function runTests() {
  let checks = 0;
  function equal(actual, expected, label) {
    checks++;
    if (!Object.is(actual, expected)) {
      throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
    }
  }
  function truthy(value, label) {
    checks++;
    if (!value) throw new Error(label);
  }
  function throws(fn, ErrorType, label) {
    checks++;
    let error;
    try { fn(); } catch (caught) { error = caught; }
    if (!(error instanceof ErrorType)) throw new Error(label + ": expected " + ErrorType.name);
  }

  const before = {
    profile: { name: "Ada", active: true, obsolete: 9 },
    tags: ["red", "blue", "green"],
    count: 2
  };
  const after = {
    profile: { name: "Ada Lovelace", active: true, role: "admin" },
    tags: ["blue", "amber", "green", "violet"],
    count: 3
  };
  const patch = diffJson(before, after);
  truthy(patch.some(operation => operation.op === "remove"), "diff contains removals");
  truthy(patch.some(operation => operation.op === "add"), "diff contains additions");
  truthy(patch.some(operation => operation.op === "replace"), "diff contains replacements");
  truthy(deepEqual(applyPatch(before, patch), after), "nested object and array round trip");
  equal(deepEqual(before, after), false, "input values remain distinct");

  const escapedBefore = { "a/b": { "~key": 1 } };
  const escapedAfter = { "a/b": { "~key": 2 } };
  const escapedPatch = diffJson(escapedBefore, escapedAfter);
  equal(escapedPatch[0].path, "/a~1b/~0key", "JSON Pointer escaping");
  truthy(deepEqual(applyPatch(escapedBefore, escapedPatch), escapedAfter), "escaped pointer round trip");

  const arrayBefore = [1, 2, 3, 4];
  const arrayAfter = [0, 2, 4, 5];
  truthy(deepEqual(applyPatch(arrayBefore, diffJson(arrayBefore, arrayAfter)), arrayAfter), "array LCS edits");
  equal(diffJson({ x: 1 }, { x: 1 }).length, 0, "no-op diff");
  truthy(deepEqual(applyPatch(7, diffJson(7, { changed: true })), { changed: true }), "root replacement");

  const source = { nested: { value: 1 } };
  const target = { nested: { value: 2 } };
  const copiedPatch = diffJson(source, target);
  target.nested.value = 99;
  equal(copiedPatch[0].value, 2, "patch values are detached copies");

  const protoPatch = applyPatch({}, [
    { op: "add", path: "/__proto__", value: { injected: true } }
  ]);
  equal(Object.getPrototypeOf(protoPatch), Object.prototype, "prototype remains unchanged");
  equal(protoPatch.__proto__.injected, true, "dangerous-looking key stored as data");

  const rng = (() => {
    let state = 0xdecafbad;
    return max => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % max;
    };
  })();
  function randomValue(depth) {
    const kind = depth > 2 ? rng(4) : rng(6);
    if (kind === 0) return null;
    if (kind === 1) return rng(2) === 0;
    if (kind === 2) return rng(101) - 50;
    if (kind === 3) return "s" + rng(8);
    if (kind === 4) return Array.from({ length: rng(5) }, () => randomValue(depth + 1));
    const object = {};
    for (let i = 0, count = rng(5); i < count; i++) object["k" + rng(7)] = randomValue(depth + 1);
    return object;
  }

  for (let trial = 0; trial < 180; trial++) {
    const left = randomValue(0);
    const right = randomValue(0);
    const actual = applyPatch(left, diffJson(left, right));
    truthy(deepEqual(actual, right), "randomized JSON round trip " + trial);
  }

  throws(() => diffJson({ value: undefined }, {}), TypeError, "undefined rejected");
  const cyclic = {};
  cyclic.self = cyclic;
  throws(() => diffJson(cyclic, {}), TypeError, "cycles rejected");
  throws(() => applyPatch({}, [{ op: "remove", path: "/missing" }]), RangeError, "missing remove rejected");
  throws(() => applyPatch({}, [{ op: "replace", path: "/x", value: 1 }]), RangeError, "missing replace rejected");
  throws(() => applyPatch({}, [{ op: "add", path: "/bad~2escape", value: 1 }]), SyntaxError, "invalid pointer escape rejected");
  throws(() => applyPatch([1], [{ op: "add", path: "/3", value: 2 }]), RangeError, "array bounds checked");
  throws(() => applyPatch(1, [{ op: "remove", path: "" }]), RangeError, "root removal rejected");
  return { passed: checks, randomizedTrials: 180 };
}

if (typeof require !== "undefined" && require.main === module) {
  const result = runTests();
  console.log("JSON diff and patch engine: " + result.passed + " checks passed");
}

module.exports = {
  validateJson,
  cloneJson,
  deepEqual,
  diffJson,
  applyPatch,
  parsePointer,
  runTests
};
