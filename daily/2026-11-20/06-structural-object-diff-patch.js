// Exercise: Produce and apply JSON-Pointer-like patches for JSON-compatible values.
// Plain objects are diffed recursively; arrays and primitives are atomic values.
// Run: node daily/2026-11-20/06-structural-object-diff-patch.js
"use strict";
const assert = require("node:assert/strict");
const clone = value => structuredClone(value);
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const escapeToken = token => token.replace(/~/g, "~0").replace(/\//g, "~1");
const unescapeToken = token => token.replace(/~1/g, "/").replace(/~0/g, "~");
function diff(before, after, path = "", operations = []) {
  if (equal(before, after)) return operations;
  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const childPath = path + "/" + escapeToken(key);
      if (!Object.hasOwn(after, key)) operations.push({ op: "remove", path: childPath });
      else if (!Object.hasOwn(before, key)) operations.push({ op: "add", path: childPath, value: clone(after[key]) });
      else diff(before[key], after[key], childPath, operations);
    }
  } else {
    operations.push({ op: "replace", path, value: clone(after) });
  }
  return operations;
}
function applyPatch(input, operations) {
  let root = clone(input);
  for (const operation of operations) {
    if (!operation || !["add", "remove", "replace"].includes(operation.op) || typeof operation.path !== "string") {
      throw new TypeError("invalid patch operation");
    }
    if (operation.path === "") {
      if (operation.op === "remove") throw new Error("cannot remove the document root");
      root = clone(operation.value);
      continue;
    }
    if (!operation.path.startsWith("/")) throw new Error("invalid pointer");
    const parts = operation.path.slice(1).split("/").map(unescapeToken);
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      if (parent === null || typeof parent !== "object" || !Object.hasOwn(parent, part)) throw new Error("path does not exist");
      parent = parent[part];
    }
    const key = parts.at(-1);
    if (parent === null || typeof parent !== "object" || Array.isArray(parent)) throw new Error("patch parent must be an object");
    if (operation.op === "add") {
      if (Object.hasOwn(parent, key)) throw new Error("add target already exists");
      parent[key] = clone(operation.value);
    } else {
      if (!Object.hasOwn(parent, key)) throw new Error("target does not exist");
      if (operation.op === "remove") delete parent[key];
      else parent[key] = clone(operation.value);
    }
  }
  return root;
}
const before = { profile: { name: "Ada", active: true }, "a/b~c": 1, list: [1, 2] };
const after = { profile: { name: "Grace", role: "admin" }, "a/b~c": 2, list: [1, 3] };
const patch = diff(before, after);
assert.deepEqual(applyPatch(before, patch), after);
assert.deepEqual(applyPatch({ x: 1 }, diff({ x: 1 }, { x: 1 })), { x: 1 });
assert.deepEqual(applyPatch({ a: 1 }, [{ op: "replace", path: "", value: { z: 9 } }]), { z: 9 });
assert.throws(() => applyPatch({ a: 1 }, [{ op: "remove", path: "/missing" }]), /does not exist/);
assert.throws(() => applyPatch({}, [{ op: "add", path: "/x", value: 1 }, { op: "add", path: "/x", value: 2 }]), /already exists/);
console.log("structural object diff/patch: all tests passed");
