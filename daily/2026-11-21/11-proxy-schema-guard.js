// Exercise: Create schema-guarded objects using Proxy and Reflect.
// Supported rules: string, number, boolean, object, and array. Nested object schemas,
// required properties, custom predicates, and array item rules must be enforced on writes.

function createSchemaGuard(initial, schema, path = "root") {
  const cache = new WeakMap();

  function validate(value, rule, propertyPath) {
    const validType =
      rule.type === "array" ? Array.isArray(value) :
      rule.type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value) :
      typeof value === rule.type;

    if (!validType) {
      throw new TypeError(propertyPath + " must be " + rule.type);
    }
    if (rule.validate && !rule.validate(value)) {
      throw new TypeError(propertyPath + " failed its validation rule");
    }
    if (rule.type === "object") {
      for (const key of Object.keys(rule.schema || {})) {
        const childRule = rule.schema[key];
        if (childRule.required && !Object.prototype.hasOwnProperty.call(value, key)) {
          throw new TypeError(propertyPath + "." + key + " is required");
        }
      }
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(rule.schema || {}, key)) {
          throw new TypeError(propertyPath + "." + key + " is not declared");
        }
        validate(value[key], rule.schema[key], propertyPath + "." + key);
      }
    }
    if (rule.type === "array" && rule.items) {
      value.forEach((item, index) => validate(item, rule.items, propertyPath + "[" + index + "]"));
    }
  }

  function wrap(value, rule, currentPath) {
    if (!value || typeof value !== "object") return value;
    if (cache.has(value)) return cache.get(value);

    const proxy = new Proxy(value, {
      get(target, key, receiver) {
        const result = Reflect.get(target, key, receiver);
        if (rule.type === "object" && typeof key === "string" && rule.schema?.[key]) {
          return wrap(result, rule.schema[key], currentPath + "." + key);
        }
        if (rule.type === "array" && rule.items && /^\d+$/.test(String(key))) {
          return wrap(result, rule.items, currentPath + "[" + key + "]");
        }
        return result;
      },
      set(target, key, nextValue) {
        if (rule.type === "array" && key === "length") {
          if (!Number.isInteger(nextValue) || nextValue < 0) throw new RangeError("invalid array length");
        } else {
          const childRule = rule.type === "array"
            ? rule.items
            : rule.schema && rule.schema[key];
          if (!childRule) throw new TypeError(currentPath + "." + String(key) + " is not declared");
          validate(nextValue, childRule, currentPath + "." + String(key));
        }
        return Reflect.set(target, key, nextValue, target);
      },
      deleteProperty(target, key) {
        const childRule = rule.type === "object" ? rule.schema?.[key] : null;
        if (childRule?.required) throw new TypeError(currentPath + "." + String(key) + " is required");
        return Reflect.deleteProperty(target, key);
      },
      defineProperty() {
        throw new TypeError("defineProperty is disabled on guarded objects");
      }
    });
    cache.set(value, proxy);
    return proxy;
  }

  validate(initial, { type: "object", schema }, path);
  return wrap(initial, { type: "object", schema }, path);
}

// Tests
const assert = require("node:assert/strict");
const user = createSchemaGuard(
  { name: "Ada", age: 36, address: { city: "London" }, scores: [8, 9] },
  {
    name: { type: "string", required: true },
    age: { type: "number", validate: value => value >= 0 },
    address: {
      type: "object",
      schema: { city: { type: "string", required: true } }
    },
    scores: { type: "array", items: { type: "number", validate: value => value >= 0 } }
  }
);

user.age = 37;
user.address.city = "Paris";
user.scores[0] = 10;
assert.equal(user.address.city, "Paris");
assert.throws(() => { user.age = -1; }, TypeError);
assert.throws(() => { user.address.country = "UK"; }, TypeError);
assert.throws(() => { delete user.name; }, TypeError);
assert.throws(() => { user.scores[1] = "high"; }, TypeError);
console.log("Proxy schema guard tests passed");
