"use strict";

/*
 * A small JSON Schema-style validator compiler.
 *
 * Supported keywords:
 *   type, const, enum, allOf, anyOf, oneOf, not
 *   minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf
 *   minLength, maxLength, pattern
 *   minItems, maxItems, uniqueItems, items
 *   required, properties, additionalProperties, minProperties, maxProperties
 *
 * This is an educational subset, not a drop-in implementation of the JSON Schema spec.
 * Validation returns every discovered issue using JSON Pointer-like paths.
 */

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
}

function childPath(path, segment) {
  return path + "/" + escapePointerSegment(segment);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) =>
    JSON.stringify(key) + ":" + stableStringify(value[key])
  ).join(",") + "}";
}

function matchesType(value, type) {
  switch (type) {
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "integer": return typeof value === "number" && Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    default: throw new TypeError("Unsupported schema type: " + type);
  }
}

function addError(errors, path, keyword, message) {
  errors.push({ path, keyword, message });
}

function validateNode(value, schema, path, errors, patternCache) {
  if (schema === true) return;
  if (schema === false) {
    addError(errors, path, "falseSchema", "Value is rejected by a false schema");
    return;
  }
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new TypeError("Every schema must be an object or boolean");
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const")) {
    if (stableStringify(value) !== stableStringify(schema.const)) {
      addError(errors, path, "const", "Value does not equal the required constant");
    }
  }

  if (Array.isArray(schema.enum)) {
    const serialized = stableStringify(value);
    if (!schema.enum.some((candidate) => stableStringify(candidate) === serialized)) {
      addError(errors, path, "enum", "Value is not one of the allowed values");
    }
  }

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((type) => matchesType(value, type))) {
      addError(errors, path, "type", "Expected type " + allowed.join(" or "));
      return;
    }
  }

  for (const keyword of ["allOf", "anyOf", "oneOf"]) {
    if (schema[keyword] === undefined) continue;
    if (!Array.isArray(schema[keyword])) {
      throw new TypeError(keyword + " must be an array");
    }

    const outcomes = schema[keyword].map((subschema) => {
      const branchErrors = [];
      validateNode(value, subschema, path, branchErrors, patternCache);
      return branchErrors;
    });

    const successful = outcomes.filter((branchErrors) => branchErrors.length === 0).length;

    if (keyword === "allOf" && successful !== outcomes.length) {
      for (const branchErrors of outcomes) errors.push(...branchErrors);
    } else if (keyword === "anyOf" && successful === 0) {
      addError(errors, path, "anyOf", "Value does not match any allowed schema");
    } else if (keyword === "oneOf" && successful !== 1) {
      addError(errors, path, "oneOf", "Value must match exactly one allowed schema");
    }
  }

  if (schema.not !== undefined) {
    const branchErrors = [];
    validateNode(value, schema.not, path, branchErrors, patternCache);
    if (branchErrors.length === 0) {
      addError(errors, path, "not", "Value matches a schema that must not match");
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      addError(errors, path, "minimum", "Number is below the minimum");
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      addError(errors, path, "maximum", "Number is above the maximum");
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      addError(errors, path, "exclusiveMinimum", "Number must be greater than the bound");
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      addError(errors, path, "exclusiveMaximum", "Number must be less than the bound");
    }
    if (schema.multipleOf !== undefined) {
      if (!(schema.multipleOf > 0)) throw new RangeError("multipleOf must be positive");
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-10) {
        addError(errors, path, "multipleOf", "Number is not a multiple of the required value");
      }
    }
  }

  if (typeof value === "string") {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      addError(errors, path, "minLength", "String is shorter than minLength");
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      addError(errors, path, "maxLength", "String is longer than maxLength");
    }
    if (schema.pattern !== undefined) {
      let regex = patternCache.get(schema);
      if (!regex) {
        regex = new RegExp(schema.pattern);
        patternCache.set(schema, regex);
      }
      if (!regex.test(value)) {
        addError(errors, path, "pattern", "String does not match the required pattern");
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      addError(errors, path, "minItems", "Array has too few items");
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      addError(errors, path, "maxItems", "Array has too many items");
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (let index = 0; index < value.length; index += 1) {
        const key = stableStringify(value[index]);
        if (seen.has(key)) {
          addError(errors, childPath(path, index), "uniqueItems", "Array item is duplicated");
        }
        seen.add(key);
      }
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) =>
        validateNode(item, schema.items, childPath(path, index), errors, patternCache)
      );
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      addError(errors, path, "minProperties", "Object has too few properties");
    }
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      addError(errors, path, "maxProperties", "Object has too many properties");
    }

    for (const requiredKey of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, requiredKey)) {
        addError(errors, childPath(path, requiredKey), "required", "Required property is missing");
      }
    }

    const properties = schema.properties || {};
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        validateNode(value[key], properties[key], childPath(path, key), errors, patternCache);
      } else if (schema.additionalProperties === false) {
        addError(errors, childPath(path, key), "additionalProperties", "Unexpected property");
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        validateNode(
          value[key],
          schema.additionalProperties,
          childPath(path, key),
          errors,
          patternCache
        );
      }
    }
  }
}

function compileSchema(schema) {
  // Validate the root shape immediately; nested schemas are checked when visited.
  if (schema !== true && schema !== false &&
      (!schema || typeof schema !== "object" || Array.isArray(schema))) {
    throw new TypeError("Root schema must be an object or boolean");
  }

  const patternCache = new WeakMap();

  return function validate(value) {
    const errors = [];
    validateNode(value, schema, "", errors, patternCache);
    return { valid: errors.length === 0, errors };
  };
}

module.exports = { compileSchema, stableStringify };

if (require.main === module) {
  const assert = require("node:assert/strict");

  const validateUser = compileSchema({
    type: "object",
    required: ["name", "age", "tags"],
    properties: {
      name: { type: "string", minLength: 2, pattern: "^[A-Z]" },
      age: { type: "integer", minimum: 18, maximum: 120 },
      tags: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: { type: "string", minLength: 1 }
      },
      profile: {
        type: "object",
        required: ["active"],
        properties: { active: { type: "boolean" } },
        additionalProperties: false
      }
    },
    additionalProperties: false
  });

  assert.equal(validateUser({
    name: "Ada",
    age: 36,
    tags: ["math", "systems"],
    profile: { active: true }
  }).valid, true);

  const invalid = validateUser({
    name: "ada",
    age: 15,
    tags: ["same", "same"],
    extra: true
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((error) => error.keyword === "pattern"));
  assert.ok(invalid.errors.some((error) => error.keyword === "minimum"));
  assert.ok(invalid.errors.some((error) => error.keyword === "uniqueItems"));
  assert.ok(invalid.errors.some((error) => error.keyword === "additionalProperties"));

  const exclusive = compileSchema({
    oneOf: [
      { type: "string", minLength: 3 },
      { type: "number", minimum: 0 }
    ]
  });
  assert.equal(exclusive("hello").valid, true);
  assert.equal(exclusive(4).valid, true);
  assert.equal(exclusive("x").valid, false);

  const allOf = compileSchema({
    allOf: [{ type: "number" }, { minimum: 10 }, { maximum: 20 }]
  });
  assert.equal(allOf(15).valid, true);
  assert.equal(allOf(25).valid, false);

  console.log("JSON Schema subset compiler: all tests passed");
}
