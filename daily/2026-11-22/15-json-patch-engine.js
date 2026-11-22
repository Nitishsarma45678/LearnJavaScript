/**
 * Exercise: Implement a JSON Patch subset (RFC 6902).
 * Support add, remove, replace, move, copy, and test operations. Paths use
 * JSON Pointer escaping (~1 for slash, ~0 for tilde). Inputs are JSON values;
 * patching is immutable and never mutates the supplied document.
 * Run: node 15-json-patch-engine.js
 */
"use strict";
const assert = require("node:assert/strict");
const { isDeepStrictEqual } = require("node:util");

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function decodePointer(path) {
  if (path === "") return [];
  if (typeof path !== "string" || !path.startsWith("/")) throw new TypeError("invalid JSON Pointer");
  return path.slice(1).split("/").map(token => {
    if (/~(?![01])/.test(token)) throw new TypeError("invalid JSON Pointer escape");
    return token.replace(/~1/g, "/").replace(/~0/g, "~");
  });
}
function arrayIndex(token, length, allowEnd = false) {
  if (allowEnd && token === "-") return length;
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new RangeError("invalid array index");
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index > length || (!allowEnd && index === length)) {
    throw new RangeError("array index out of bounds");
  }
  return index;
}
function parentAt(root, tokens) {
  if (!tokens.length) return { root: true };
  let parent = root;
  for (const token of tokens.slice(0, -1)) {
    if (parent === null || typeof parent !== "object") throw new TypeError("path traverses a primitive");
    parent = Array.isArray(parent) ? parent[arrayIndex(token, parent.length)] : parent[token];
    if (parent === undefined) throw new RangeError("path does not exist");
  }
  if (parent === null || typeof parent !== "object") throw new TypeError("parent is not a container");
  return { parent, key: tokens.at(-1) };
}
function getAt(root, tokens) {
  let value = root;
  for (const token of tokens) {
    if (value === null || typeof value !== "object") throw new RangeError("path does not exist");
    value = Array.isArray(value) ? value[arrayIndex(token, value.length)] : value[token];
    if (value === undefined) throw new RangeError("path does not exist");
  }
  return value;
}
function addAt(root, tokens, value) {
  if (!tokens.length) return clone(value);
  const { parent, key } = parentAt(root, tokens);
  if (Array.isArray(parent)) parent.splice(arrayIndex(key, parent.length, true), 0, clone(value));
  else parent[key] = clone(value);
  return root;
}
function removeAt(root, tokens) {
  if (!tokens.length) return undefined;
  const { parent, key } = parentAt(root, tokens);
  let removed;
  if (Array.isArray(parent)) removed = parent.splice(arrayIndex(key, parent.length), 1)[0];
  else {
    if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new RangeError("path does not exist");
    removed = parent[key];
    delete parent[key];
  }
  return { document: root, removed };
}
function applyPatch(document, operations) {
  if (!Array.isArray(operations)) throw new TypeError("operations must be an array");
  let result = clone(document);
  for (const operation of operations) {
    if (!operation || typeof operation !== "object") throw new TypeError("invalid operation");
    const path = decodePointer(operation.path);
    switch (operation.op) {
      case "add":
        result = addAt(result, path, operation.value);
        break;
      case "remove": {
        const removal = removeAt(result, path);
        result = path.length ? removal.document : undefined;
        break;
      }
      case "replace":
        getAt(result, path);
        result = addAt(result, path, operation.value);
        break;
      case "copy": {
        const value = clone(getAt(result, decodePointer(operation.from)));
        result = addAt(result, path, value);
        break;
      }
      case "move": {
        const from = decodePointer(operation.from);
        if (path.length > from.length && from.every((part, i) => path[i] === part)) {
          throw new RangeError("cannot move a value into its own descendant");
        }
        const removal = removeAt(result, from);
        result = from.length ? removal.document : undefined;
        result = addAt(result, path, removal.removed);
        break;
      }
      case "test":
        if (!isDeepStrictEqual(getAt(result, path), operation.value)) {
          throw new Error("JSON Patch test operation failed");
        }
        break;
      default:
        throw new TypeError("unsupported operation: " + operation.op);
    }
  }
  return result;
}

const original = { name: "Ada", tags: ["math", "logic"], meta: { "a/b": 1 } };
const updated = applyPatch(original, [
  { op: "replace", path: "/name", value: "Grace" },
  { op: "add", path: "/tags/-", value: "computing" },
  { op: "copy", from: "/meta/a~1b", path: "/copied" },
  { op: "test", path: "/tags/0", value: "math" },
  { op: "move", from: "/tags/1", path: "/tags/0" }
]);
assert.equal(updated.name, "Grace");
assert.deepEqual(updated.tags, ["logic", "math", "computing"]);
assert.equal(updated.copied, 1);
assert.equal(original.name, "Ada");
assert.throws(() => applyPatch(original, [{ op: "test", path: "/name", value: "wrong" }]), /test operation failed/);
assert.throws(() => decodePointer("/bad~2escape"), TypeError);
console.log("JSON Patch tests passed");
module.exports = { applyPatch, decodePointer };
