"use strict";

const assert = require("node:assert/strict");

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value, ancestors = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JSON numbers must be finite");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("value is not JSON-compatible");
  if (ancestors.has(value)) throw new TypeError("cyclic values are not JSON-compatible");

  ancestors.add(value);
  let copy;

  if (Array.isArray(value)) {
    copy = value.map((item) => cloneJson(item, ancestors));
  } else {
    if (!isPlainObject(value)) throw new TypeError("only plain JSON objects are supported");
    copy = Object.getPrototypeOf(value) === null ? Object.create(null) : {};

    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) {
        throw new TypeError("accessor properties are not JSON-compatible");
      }
      Object.defineProperty(copy, key, {
        value: cloneJson(descriptor.value, ancestors),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
  }

  ancestors.delete(value);
  return copy;
}

function parsePointer(pointer) {
  if (typeof pointer !== "string") throw new TypeError("JSON Pointer must be a string");
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error("JSON Pointer must be empty or start with '/'");

  return pointer.slice(1).split("/").map((token) => {
    if (/~(?![01])/.test(token)) throw new Error("invalid JSON Pointer escape");
    return token.replace(/~1/g, "/").replace(/~0/g, "~");
  });
}

function arrayIndex(token, length, allowEnd) {
  if (allowEnd && token === "-") return length;
  if (!/^(0|[1-9][0-9]*)$/.test(token)) throw new Error("invalid array index: " + token);

  const index = Number(token);
  if (!Number.isSafeInteger(index) || index > length || (!allowEnd && index === length)) {
    throw new RangeError("array index is out of bounds: " + token);
  }
  return index;
}

function childAt(parent, token) {
  if (Array.isArray(parent)) return parent[arrayIndex(token, parent.length, false)];
  if (isPlainObject(parent) && Object.hasOwn(parent, token)) return parent[token];
  throw new Error("path does not exist at token: " + token);
}

function getAt(document, tokens) {
  let current = document;
  for (const token of tokens) current = childAt(current, token);
  return current;
}

function parentAt(document, tokens) {
  if (tokens.length === 0) return { root: true };
  return {
    root: false,
    parent: getAt(document, tokens.slice(0, -1)),
    token: tokens[tokens.length - 1]
  };
}

function defineJsonProperty(object, key, value) {
  Object.defineProperty(object, key, {
    value: cloneJson(value),
    enumerable: true,
    configurable: true,
    writable: true
  });
}

function addAt(document, tokens, value) {
  const location = parentAt(document, tokens);
  if (location.root) return cloneJson(value);

  const { parent, token } = location;
  if (Array.isArray(parent)) {
    parent.splice(arrayIndex(token, parent.length, true), 0, cloneJson(value));
    return document;
  }
  if (!isPlainObject(parent)) throw new Error("add target parent must be an object or array");

  defineJsonProperty(parent, token, value);
  return document;
}

function removeAt(document, tokens) {
  const location = parentAt(document, tokens);
  if (location.root) throw new Error("removing the document root is not supported");

  const { parent, token } = location;
  if (Array.isArray(parent)) {
    const index = arrayIndex(token, parent.length, false);
    return { document, removed: parent.splice(index, 1)[0] };
  }
  if (!isPlainObject(parent) || !Object.hasOwn(parent, token)) {
    throw new Error("remove target does not exist");
  }

  const removed = parent[token];
  delete parent[token];
  return { document, removed };
}

function replaceAt(document, tokens, value) {
  const location = parentAt(document, tokens);
  if (location.root) return cloneJson(value);

  const { parent, token } = location;
  if (Array.isArray(parent)) {
    parent[arrayIndex(token, parent.length, false)] = cloneJson(value);
    return document;
  }
  if (!isPlainObject(parent) || !Object.hasOwn(parent, token)) {
    throw new Error("replace target does not exist");
  }

  defineJsonProperty(parent, token, value);
  return document;
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]));
  }

  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) =>
    Object.hasOwn(right, key) && deepEqual(left[key], right[key])
  );
}

function isPrefixPath(prefix, path) {
  return prefix.length < path.length && prefix.every((token, index) => token === path[index]);
}

/**
 * Apply a JSON Patch operation list transactionally.
 *
 * The input is cloned first, so a failing operation never mutates the caller's
 * document. Supported operations: add, remove, replace, move, copy and test.
 * This implementation intentionally rejects removing the document root.
 */
function applyPatch(document, operations) {
  if (!Array.isArray(operations)) throw new TypeError("operations must be an array");

  let working = cloneJson(document);

  for (let patchIndex = 0; patchIndex < operations.length; patchIndex += 1) {
    const operation = operations[patchIndex];

    try {
      if (!isPlainObject(operation) || typeof operation.op !== "string") {
        throw new TypeError("each operation must be an object with an op");
      }
      const pathTokens = parsePointer(operation.path);

      switch (operation.op) {
        case "add":
          if (!Object.hasOwn(operation, "value")) throw new Error("add requires value");
          working = addAt(working, pathTokens, operation.value);
          break;

        case "remove":
          working = removeAt(working, pathTokens).document;
          break;

        case "replace":
          if (!Object.hasOwn(operation, "value")) throw new Error("replace requires value");
          working = replaceAt(working, pathTokens, operation.value);
          break;

        case "copy": {
          if (typeof operation.from !== "string") throw new Error("copy requires from");
          const source = cloneJson(getAt(working, parsePointer(operation.from)));
          working = addAt(working, pathTokens, source);
          break;
        }

        case "move": {
          if (typeof operation.from !== "string") throw new Error("move requires from");
          const fromTokens = parsePointer(operation.from);

          if (fromTokens.length === pathTokens.length &&
              fromTokens.every((token, index) => token === pathTokens[index])) {
            break;
          }
          if (isPrefixPath(fromTokens, pathTokens)) {
            throw new Error("cannot move a value into one of its descendants");
          }

          const source = cloneJson(getAt(working, fromTokens));
          working = removeAt(working, fromTokens).document;
          working = addAt(working, pathTokens, source);
          break;
        }

        case "test": {
          if (!Object.hasOwn(operation, "value")) throw new Error("test requires value");
          const actual = getAt(working, pathTokens);
          if (!deepEqual(actual, operation.value)) throw new Error("test operation failed");
          break;
        }

        default:
          throw new Error("unsupported operation: " + operation.op);
      }
    } catch (error) {
      if (error && typeof error === "object") {
        Object.defineProperty(error, "patchIndex", {
          value: patchIndex,
          configurable: true,
          enumerable: true
        });
      }
      throw error;
    }
  }

  return working;
}

// Exercise add, replace, copy, move, escaped pointers and test.
const original = {
  profile: { name: "Ada", tags: ["math", "code"] },
  "a/b": 1
};

const updated = applyPatch(original, [
  { op: "add", path: "/profile/tags/-", value: "graphs" },
  { op: "replace", path: "/profile/name", value: "Grace" },
  { op: "copy", from: "/profile/name", path: "/alias" },
  { op: "move", from: "/profile/tags/0", path: "/profile/tags/1" },
  { op: "test", path: "/a~1b", value: 1 }
]);

assert.deepEqual(updated, {
  profile: { name: "Grace", tags: ["code", "math", "graphs"] },
  "a/b": 1,
  alias: "Grace"
});
assert.deepEqual(original, {
  profile: { name: "Ada", tags: ["math", "code"] },
  "a/b": 1
});

// A failed later operation reports its index and leaves the original untouched.
assert.throws(
  () => applyPatch(original, [
    { op: "replace", path: "/profile/name", value: "Lin" },
    { op: "remove", path: "/missing" }
  ]),
  (error) => error.patchIndex === 1
);
assert.equal(original.profile.name, "Ada");

// Root replacement, escaped tilde, and safe handling of the __proto__ key.
assert.deepEqual(applyPatch({ old: true }, [
  { op: "replace", path: "", value: [1, 2, 3] }
]), [1, 2, 3]);

const safe = applyPatch({}, [
  { op: "add", path: "/__proto__", value: { polluted: true } }
]);
assert.equal(Object.getPrototypeOf(safe), Object.prototype);
assert.equal(Object.hasOwn(safe, "__proto__"), true);
assert.equal({}.polluted, undefined);

assert.throws(() => parsePointer("/bad~2escape"), /escape/);
assert.throws(() => applyPatch({ a: { b: 1 } }, [
  { op: "move", from: "/a", path: "/a/b/c" }
]), /descendants/);

module.exports = { applyPatch, parsePointer, deepEqual };
