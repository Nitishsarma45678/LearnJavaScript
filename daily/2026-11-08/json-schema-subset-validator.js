"use strict";

// A dependency-free JSON Schema subset validator.
// Supports local JSON Pointer $ref, recursive schemas, composition,
// object/array constraints, string patterns and numeric bounds.

const assert = require("node:assert/strict");

function deepEqual(left, right, seen = new WeakMap()) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  let partners = seen.get(left);
  if (partners?.has(right)) return true;
  if (!partners) seen.set(left, partners = new WeakSet());
  partners.add(right);

  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) ||
        !deepEqual(left[key], right[key], seen)) return false;
  }
  return true;
}

function isType(value, type) {
  switch (type) {
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    default: return false;
  }
}

function childPath(path, key) {
  return /^[A-Za-z_$][\w$]*$/.test(String(key))
    ? path + "." + key
    : path + "[" + JSON.stringify(String(key)) + "]";
}

function resolvePointer(root, reference) {
  if (reference === "#") return root;
  if (typeof reference !== "string" || !reference.startsWith("#/")) {
    throw new Error("only local JSON Pointer references are supported");
  }

  return reference.slice(2).split("/").reduce((current, rawSegment) => {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object" ||
        !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new Error("unresolved reference: " + reference);
    }
    return current[segment];
  }, root);
}

function validate(instance, schema, options = {}) {
  const errors = [];
  const maxErrors = options.maxErrors ?? 100;
  const activePairs = new WeakMap();
  const refGuard = new Set();

  function add(path, keyword, message, details) {
    if (errors.length < maxErrors) {
      errors.push({ path, keyword, message, ...(details ? { details } : {}) });
    }
  }

  function visit(value, currentSchema, path) {
    if (errors.length >= maxErrors) return;
    if (currentSchema === true) return;
    if (currentSchema === false) {
      add(path, "falseSchema", "value is rejected by a false schema");
      return;
    }
    if (!currentSchema || typeof currentSchema !== "object" || Array.isArray(currentSchema)) {
      add(path, "schema", "schema must be an object or boolean");
      return;
    }

    const trackable = value !== null && typeof value === "object";
    let activeSet;
    if (trackable) {
      activeSet = activePairs.get(value);
      if (activeSet?.has(currentSchema)) return; // coinductive cycle guard
      if (!activeSet) activePairs.set(value, activeSet = new Set());
      activeSet.add(currentSchema);
    }

    try {
      if (typeof currentSchema.$ref === "string") {
        const guardKey = currentSchema.$ref + "|" + path;
        if (refGuard.has(guardKey)) {
          add(path, "$ref", "circular reference did not descend into the instance");
        } else {
          try {
            const target = resolvePointer(rootSchema, currentSchema.$ref);
            refGuard.add(guardKey);
            visit(value, target, path);
            refGuard.delete(guardKey);
          } catch (error) {
            refGuard.delete(guardKey);
            add(path, "$ref", error.message);
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(currentSchema, "type")) {
        const allowed = Array.isArray(currentSchema.type) ? currentSchema.type : [currentSchema.type];
        if (!allowed.some(type => isType(value, type))) {
          add(path, "type", "expected " + allowed.join(" or "));
          return;
        }
      }

      if (Object.prototype.hasOwnProperty.call(currentSchema, "const") &&
          !deepEqual(value, currentSchema.const)) {
        add(path, "const", "value does not equal the required constant");
      }
      if (Array.isArray(currentSchema.enum) &&
          !currentSchema.enum.some(candidate => deepEqual(value, candidate))) {
        add(path, "enum", "value is not one of the allowed values");
      }

      if (typeof value === "string") {
        const length = Array.from(value).length;
        if (Number.isInteger(currentSchema.minLength) && length < currentSchema.minLength) {
          add(path, "minLength", "string is shorter than minLength");
        }
        if (Number.isInteger(currentSchema.maxLength) && length > currentSchema.maxLength) {
          add(path, "maxLength", "string is longer than maxLength");
        }
        if (typeof currentSchema.pattern === "string") {
          try {
            if (!new RegExp(currentSchema.pattern).test(value)) {
              add(path, "pattern", "string does not match pattern");
            }
          } catch {
            add(path, "pattern", "schema contains an invalid regular expression");
          }
        }
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        for (const [keyword, predicate, message] of [
          ["minimum", (limit) => value >= limit, "number is below minimum"],
          ["maximum", (limit) => value <= limit, "number is above maximum"],
          ["exclusiveMinimum", (limit) => value > limit, "number is not above exclusiveMinimum"],
          ["exclusiveMaximum", (limit) => value < limit, "number is not below exclusiveMaximum"]
        ]) {
          if (typeof currentSchema[keyword] === "number" &&
              !predicate(currentSchema[keyword])) add(path, keyword, message);
        }
        if (typeof currentSchema.multipleOf === "number" && currentSchema.multipleOf > 0) {
          const quotient = value / currentSchema.multipleOf;
          if (Math.abs(quotient - Math.round(quotient)) > 1e-10) {
            add(path, "multipleOf", "number is not a multiple of multipleOf");
          }
        }
      }

      if (Array.isArray(value)) {
        if (Number.isInteger(currentSchema.minItems) && value.length < currentSchema.minItems) {
          add(path, "minItems", "array has too few items");
        }
        if (Number.isInteger(currentSchema.maxItems) && value.length > currentSchema.maxItems) {
          add(path, "maxItems", "array has too many items");
        }
        if (currentSchema.uniqueItems === true) {
          for (let i = 0; i < value.length; i++) {
            for (let j = i + 1; j < value.length; j++) {
              if (deepEqual(value[i], value[j])) {
                add(path, "uniqueItems", "array contains duplicate items", { first: i, duplicate: j });
                i = value.length;
                break;
              }
            }
          }
        }
        if (currentSchema.items !== undefined) {
          value.forEach((item, index) => visit(item, currentSchema.items, path + "[" + index + "]"));
        }
      }

      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        const keys = Object.keys(value);
        if (Number.isInteger(currentSchema.minProperties) && keys.length < currentSchema.minProperties) {
          add(path, "minProperties", "object has too few properties");
        }
        if (Number.isInteger(currentSchema.maxProperties) && keys.length > currentSchema.maxProperties) {
          add(path, "maxProperties", "object has too many properties");
        }

        if (Array.isArray(currentSchema.required)) {
          for (const key of currentSchema.required) {
            if (!Object.prototype.hasOwnProperty.call(value, key)) {
              add(path, "required", "missing required property: " + key);
            }
          }
        }

        const properties = currentSchema.properties || {};
        for (const [key, propertySchema] of Object.entries(properties)) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            visit(value[key], propertySchema, childPath(path, key));
          }
        }

        if (currentSchema.additionalProperties !== undefined) {
          for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
            if (currentSchema.additionalProperties === false) {
              add(childPath(path, key), "additionalProperties", "property is not allowed");
            } else if (typeof currentSchema.additionalProperties === "object") {
              visit(value[key], currentSchema.additionalProperties, childPath(path, key));
            }
          }
        }
      }

      for (const keyword of ["allOf", "anyOf", "oneOf"]) {
        if (!Array.isArray(currentSchema[keyword])) continue;
        const branchErrors = currentSchema[keyword].map(branch => {
          const local = errors.splice(0, errors.length);
          visit(value, branch, path);
          const produced = errors.splice(0, errors.length);
          errors.push(...local);
          return produced;
        });
        const passing = branchErrors.filter(branch => branch.length === 0).length;

        if (keyword === "allOf" && passing !== branchErrors.length) {
          branchErrors.forEach((branch, index) => {
            if (branch.length) add(path, keyword, "allOf branch " + index + " failed", branch);
          });
        } else if (keyword === "anyOf" && passing === 0) {
          add(path, keyword, "no anyOf branch matched", branchErrors);
        } else if (keyword === "oneOf" && passing !== 1) {
          add(path, keyword, "oneOf requires exactly one matching branch", { passing });
        }
      }

      if (currentSchema.not !== undefined) {
        const saved = errors.splice(0, errors.length);
        visit(value, currentSchema.not, path);
        const matched = errors.length === 0;
        errors.splice(0, errors.length);
        errors.push(...saved);
        if (matched) add(path, "not", "value matches a schema forbidden by not");
      }
    } finally {
      if (trackable) {
        activeSet.delete(currentSchema);
        if (activeSet.size === 0) activePairs.delete(value);
      }
    }
  }

  const rootSchema = schema;
  visit(instance, schema, "$");
  return { valid: errors.length === 0, errors };
}

// ------------------------------- Tests ---------------------------------

function runTests() {
  const personSchema = {
    type: "object",
    required: ["name", "age"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 2, pattern: "^[A-Z]" },
      age: { type: "integer", minimum: 0, maximum: 130 },
      tags: { type: "array", uniqueItems: true, items: { type: "string" } },
      manager: { $ref: "#/$defs/person" }
    },
    $defs: {
      person: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          manager: { $ref: "#/$defs/person" }
        }
      }
    }
  };

  const valid = validate({
    name: "Ada", age: 36, tags: ["math", "code"],
    manager: { name: "Grace", manager: { name: "Katherine" } }
  }, personSchema);
  assert.equal(valid.valid, true, JSON.stringify(valid.errors));

  const invalid = validate({
    name: "a", age: -1, tags: ["same", "same"], extra: true
  }, personSchema);
  assert.equal(invalid.valid, false);
  assert(invalid.errors.some(error => error.keyword === "minLength"));
  assert(invalid.errors.some(error => error.keyword === "minimum"));
  assert(invalid.errors.some(error => error.keyword === "uniqueItems"));
  assert(invalid.errors.some(error => error.keyword === "additionalProperties"));

  assert.equal(validate(7, { anyOf: [{ type: "string" }, { type: "number" }] }).valid, true);
  assert.equal(validate(7, { oneOf: [{ type: "number" }, { minimum: 5 }] }).valid, false);
  assert.equal(validate("blocked", { not: { const: "blocked" } }).valid, false);
  assert.equal(validate({ x: 2 }, { properties: { x: { multipleOf: 2 } } }).valid, true);
  assert.equal(validate({ x: 3 }, { properties: { x: { multipleOf: 2 } } }).valid, false);
  assert.equal(validate({ self: null }, { type: "object" }).valid, true);

  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(validate(cyclic, {
    type: "object", properties: { self: { $ref: "#" } }
  }).valid, true, "recursive instance graphs must terminate");

  assert.equal(validate("anything", false).valid, false);
  assert.equal(validate("x", { $ref: "#/$defs/missing" }).valid, false);

  console.log("JSON Schema subset validator: all tests passed.");
}

if (require.main === module) runTests();

module.exports = { validate, deepEqual };
