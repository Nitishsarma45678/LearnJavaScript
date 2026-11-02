// A dependency-free validator for a useful JSON Schema subset.
// Supported keywords: type, enum, required, properties, additionalProperties,
// items, minItems, maxItems, minLength, maxLength, pattern, minimum, maximum.
function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}
function assertEqual(actual, expected, message) {
  if (!Object.is(actual, expected)) throw new Error(message || `Expected ${expected}, received ${actual}`);
}
function typeMatches(value, type) {
  switch (type) {
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "string": return typeof value === "string";
    case "boolean": return typeof value === "boolean";
    default: throw new TypeError(`Unsupported schema type: ${type}`);
  }
}

function validateJSON(value, schema) {
  const errors = [];

  function visit(current, rule, path) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new TypeError("each schema node must be an object");
    }

    if (rule.type && !typeMatches(current, rule.type)) {
      errors.push({ path, keyword: "type", message: `expected ${rule.type}` });
      return;
    }

    if (rule.enum && !rule.enum.some(candidate => Object.is(candidate, current))) {
      errors.push({ path, keyword: "enum", message: "value is not an allowed enum member" });
    }

    if (typeof current === "string") {
      if (rule.minLength !== undefined && current.length < rule.minLength) {
        errors.push({ path, keyword: "minLength", message: `must contain at least ${rule.minLength} characters` });
      }
      if (rule.maxLength !== undefined && current.length > rule.maxLength) {
        errors.push({ path, keyword: "maxLength", message: `must contain at most ${rule.maxLength} characters` });
      }
      if (rule.pattern !== undefined) {
        let regex;
        try { regex = new RegExp(rule.pattern); }
        catch { throw new TypeError(`invalid schema pattern at ${path}`); }
        if (!regex.test(current)) errors.push({ path, keyword: "pattern", message: `must match ${rule.pattern}` });
      }
    }

    if (typeof current === "number" && Number.isFinite(current)) {
      if (rule.minimum !== undefined && current < rule.minimum) {
        errors.push({ path, keyword: "minimum", message: `must be >= ${rule.minimum}` });
      }
      if (rule.maximum !== undefined && current > rule.maximum) {
        errors.push({ path, keyword: "maximum", message: `must be <= ${rule.maximum}` });
      }
    }

    if (Array.isArray(current)) {
      if (rule.minItems !== undefined && current.length < rule.minItems) {
        errors.push({ path, keyword: "minItems", message: `must contain at least ${rule.minItems} items` });
      }
      if (rule.maxItems !== undefined && current.length > rule.maxItems) {
        errors.push({ path, keyword: "maxItems", message: `must contain at most ${rule.maxItems} items` });
      }
      if (rule.items) current.forEach((item, index) => visit(item, rule.items, `${path}[${index}]`));
    }

    if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      for (const key of rule.required || []) {
        if (!Object.hasOwn(current, key)) {
          errors.push({ path: `${path}.${key}`, keyword: "required", message: "property is required" });
        }
      }
      const properties = rule.properties || {};
      for (const [key, childSchema] of Object.entries(properties)) {
        if (Object.hasOwn(current, key)) visit(current[key], childSchema, `${path}.${key}`);
      }
      if (rule.additionalProperties === false) {
        for (const key of Object.keys(current)) {
          if (!Object.hasOwn(properties, key)) {
            errors.push({ path: `${path}.${key}`, keyword: "additionalProperties", message: "property is not allowed" });
          }
        }
      }
    }
  }

  visit(value, schema, "$");
  return { valid: errors.length === 0, errors };
}

async function runTests() {
  const schema = {
    type: "object",
    required: ["name", "age", "tags"],
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 2, pattern: "^[A-Z]" },
      age: { type: "integer", minimum: 0, maximum: 120 },
      tags: { type: "array", minItems: 1, items: { type: "string" } }
    }
  };
  const good = validateJSON({ name: "Ada", age: 36, tags: ["math", "code"] }, schema);
  assert(good.valid, JSON.stringify(good.errors));
  const bad = validateJSON({ name: "a", age: -1, tags: [3], extra: true }, schema);
  assert(!bad.valid);
  assertEqual(bad.errors.length, 5);
  assert(bad.errors.some(error => error.path === "$.tags[0]" && error.keyword === "type"));
  assert(!validateJSON("not-an-object", schema).valid);
  console.log("JSON schema validator tests passed");
}
runTests().catch(error => { console.error(error); process.exitCode = 1; });
