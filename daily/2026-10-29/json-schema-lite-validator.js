/**
 * A small recursive validator for a documented JSON-Schema-like subset.
 * Supported keywords: type, enum (primitive values), required, properties,
 * additionalProperties, items, min/maxLength, min/maxItems, minimum, maximum.
 *
 * Run: node daily/2026-10-29/json-schema-lite-validator.js
 */
const assert = require("node:assert/strict");

function typeMatches(value, type) {
  switch (type) {
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array": return Array.isArray(value);
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: throw new TypeError("unsupported schema type: " + type);
  }
}

function validate(value, schema) {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new TypeError("schema must be an object");
  }

  const errors = [];
  function add(path, keyword, message) {
    errors.push({ path, keyword, message });
  }

  function visit(current, rule, path) {
    if (rule.type !== undefined && !typeMatches(current, rule.type)) {
      add(path, "type", "expected " + rule.type);
      return; // Avoid cascades from constraints that assume another type.
    }

    if (rule.enum !== undefined) {
      if (!Array.isArray(rule.enum) || !rule.enum.some((item) =>
        item === null || ["string", "number", "boolean"].includes(typeof item)
          ? Object.is(item, current) : false)) {
        add(path, "enum", "value is not an allowed primitive");
      }
    }

    if (typeof current === "string") {
      if (rule.minLength !== undefined && current.length < rule.minLength) {
        add(path, "minLength", "string is too short");
      }
      if (rule.maxLength !== undefined && current.length > rule.maxLength) {
        add(path, "maxLength", "string is too long");
      }
    }

    if (typeof current === "number" && Number.isFinite(current)) {
      if (rule.minimum !== undefined && current < rule.minimum) {
        add(path, "minimum", "number is below minimum");
      }
      if (rule.maximum !== undefined && current > rule.maximum) {
        add(path, "maximum", "number is above maximum");
      }
    }

    if (Array.isArray(current)) {
      if (rule.minItems !== undefined && current.length < rule.minItems) {
        add(path, "minItems", "array has too few items");
      }
      if (rule.maxItems !== undefined && current.length > rule.maxItems) {
        add(path, "maxItems", "array has too many items");
      }
      if (rule.items !== undefined) {
        current.forEach((item, index) => visit(item, rule.items, path + "[" + index + "]"));
      }
    }

    if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      const properties = rule.properties || {};
      for (const key of rule.required || []) {
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
          add(path + "." + key, "required", "property is required");
        }
      }
      for (const key of Object.keys(current)) {
        if (Object.prototype.hasOwnProperty.call(properties, key)) {
          visit(current[key], properties[key], path + "." + key);
        } else if (rule.additionalProperties === false) {
          add(path + "." + key, "additionalProperties", "property is not allowed");
        }
      }
    }
  }

  visit(value, schema, "$");
  return errors;
}

if (require.main === module) {
  const userSchema = {
    type: "object",
    required: ["name", "age", "tags"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 2, maxLength: 30 },
      age: { type: "integer", minimum: 0, maximum: 130 },
      tags: { type: "array", minItems: 1, items: { type: "string" } },
      active: { type: "boolean" }
    }
  };

  assert.deepEqual(validate({
    name: "Mira", age: 29, tags: ["js", "security"], active: true
  }, userSchema), []);

  const errors = validate({
    name: "M", age: -1, tags: [42], extra: true
  }, userSchema);
  assert.deepEqual(errors.map((error) => error.keyword).sort(),
    ["additionalProperties", "maximum", "minimum", "minLength", "required", "type"].sort());
  assert.ok(errors.some((error) => error.path === "$.tags[0]" && error.keyword === "type"));
  assert.equal(validate(null, { type: "object" }).length, 1);
  assert.throws(() => validate({}, null), TypeError);
  console.log("json-schema-lite-validator: all assertions passed");
}

module.exports = { validate };
