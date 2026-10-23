/**
 * Recursive JSON-like schema validator
 *
 * Supported keywords:
 * type, enum, const, required, properties, additionalProperties, items,
 * minItems, maxItems, minLength, maxLength, minimum, maximum, and oneOf.
 *
 * This is a learning implementation, not a complete JSON Schema standard
 * implementation. It accumulates all detectable errors with precise paths.
 */

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

function matchesType(value, type) {
  switch (type) {
    case "null":
      return value === null;
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
    default:
      throw new TypeError(`Unsupported schema type: ${type}`);
  }
}

function validate(value, schema, path = "$") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new TypeError(`Schema at ${path} must be an object`);
  }

  const errors = [];

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push({
      path,
      keyword: "type",
      message: `Expected ${schema.type}`,
      actual: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
    });
    // Other keywords may assume the requested type, so stop at this node.
    return errors;
  }

  if (hasOwn(schema, "const") && !Object.is(value, schema.const)) {
    errors.push({
      path,
      keyword: "const",
      message: "Value does not match the required constant",
    });
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push({
      path,
      keyword: "enum",
      message: "Value is not one of the allowed values",
    });
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        keyword: "minLength",
        message: `Must contain at least ${schema.minLength} characters`,
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        keyword: "maxLength",
        message: `Must contain at most ${schema.maxLength} characters`,
      });
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        keyword: "minimum",
        message: `Must be at least ${schema.minimum}`,
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        keyword: "maximum",
        message: `Must be at most ${schema.maximum}`,
      });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path,
        keyword: "minItems",
        message: `Must contain at least ${schema.minItems} items`,
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path,
        keyword: "maxItems",
        message: `Must contain at most ${schema.maxItems} items`,
      });
    }

    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validate(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties || {};
    const required = schema.required || [];

    for (const key of required) {
      if (!hasOwn(value, key)) {
        errors.push({
          path: `${path}.${key}`,
          keyword: "required",
          message: "Required property is missing",
        });
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (hasOwn(value, key)) {
        errors.push(...validate(value[key], childSchema, `${path}.${key}`));
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!hasOwn(properties, key)) {
          errors.push({
            path: `${path}.${key}`,
            keyword: "additionalProperties",
            message: "Unexpected property",
          });
        }
      }
    } else if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === "object"
    ) {
      for (const key of Object.keys(value)) {
        if (!hasOwn(properties, key)) {
          errors.push(
            ...validate(value[key], schema.additionalProperties, `${path}.${key}`)
          );
        }
      }
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const successfulBranches = schema.oneOf.filter(
      (branch) => validate(value, branch, path).length === 0
    ).length;

    if (successfulBranches !== 1) {
      errors.push({
        path,
        keyword: "oneOf",
        message:
          successfulBranches === 0
            ? "Value did not match any oneOf branch"
            : "Value matched more than one oneOf branch",
      });
    }
  }

  return errors;
}

// Example schema with nested objects, arrays, enums, and a discriminated union.
const accountSchema = {
  type: "object",
  required: ["id", "name", "roles", "contact"],
  additionalProperties: false,
  properties: {
    id: { type: "integer", minimum: 1 },
    name: { type: "string", minLength: 2, maxLength: 60 },
    roles: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: ["reader", "editor", "admin"] },
    },
    contact: {
      type: "object",
      required: ["kind", "value"],
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["email", "phone"] },
        value: { type: "string", minLength: 5 },
      },
    },
    quota: { type: "number", minimum: 0, maximum: 1000 },
    identity: {
      oneOf: [
        {
          type: "object",
          required: ["kind", "email"],
          additionalProperties: false,
          properties: {
            kind: { const: "email" },
            email: { type: "string", minLength: 5 },
          },
        },
        {
          type: "object",
          required: ["kind", "employeeId"],
          additionalProperties: false,
          properties: {
            kind: { const: "employee" },
            employeeId: { type: "string", minLength: 3 },
          },
        },
      ],
    },
  },
};

const validAccount = {
  id: 42,
  name: "Asha Das",
  roles: ["reader", "editor"],
  contact: { kind: "email", value: "asha@example.com" },
  quota: 250,
  identity: { kind: "employee", employeeId: "EMP-17" },
};

const invalidAccount = {
  id: 0,
  name: "A",
  roles: ["owner"],
  contact: { kind: "email" },
  quota: 1200,
  identity: { kind: "email", employeeId: "E1" },
  debug: true,
};

console.log("Valid account errors:", validate(validAccount, accountSchema));
console.log("Invalid account errors:");
console.table(validate(invalidAccount, accountSchema));

// Small assertions so the example also acts as a smoke test.
const assert = require("node:assert/strict");
assert.equal(validate(validAccount, accountSchema).length, 0);
assert.ok(validate(invalidAccount, accountSchema).length >= 6);
console.log("Smoke tests passed.");
