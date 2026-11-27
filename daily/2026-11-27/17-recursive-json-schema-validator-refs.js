'use strict';

// Exercise: implement a practical JSON Schema subset with local $ref resolution,
// nested arrays/objects, required properties, numeric/string constraints and
// path-aware validation errors.

function validateSchema(rootSchema, value) {
  const errors = [];
  const active = new WeakMap();

  function resolveRef(ref) {
    if (!ref.startsWith('#/')) throw new Error('Only local JSON Pointer refs are supported');
    return ref.slice(2).split('/').reduce((node, part) => {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (node == null || !(key in node)) throw new Error('Unresolved schema reference: ' + ref);
      return node[key];
    }, rootSchema);
  }

  function check(schema, current, path) {
    if (schema.$ref) {
      const target = resolveRef(schema.$ref);
      if (current && typeof current === 'object') {
        let refs = active.get(current);
        if (!refs) active.set(current, refs = new Set());
        if (refs.has(target)) return;
        refs.add(target);
        check(target, current, path);
        refs.delete(target);
      } else {
        check(target, current, path);
      }
      return;
    }

    if (schema.enum && !schema.enum.some(candidate => Object.is(candidate, current))) {
      errors.push({ path, message: 'Value is not in enum' });
      return;
    }

    const actualType = current === null ? 'null' :
      Array.isArray(current) ? 'array' :
      Number.isInteger(current) ? 'integer' :
      typeof current;
    const allowed = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
    const typeMatches = allowed.length === 0 || allowed.some(type =>
      type === actualType || (type === 'number' && actualType === 'integer'));
    if (!typeMatches) {
      errors.push({ path, message: 'Expected ' + allowed.join('|') + ', got ' + actualType });
      return;
    }

    if (typeof current === 'number') {
      if (schema.minimum !== undefined && current < schema.minimum) errors.push({ path, message: 'Below minimum' });
      if (schema.maximum !== undefined && current > schema.maximum) errors.push({ path, message: 'Above maximum' });
    }
    if (typeof current === 'string') {
      if (schema.minLength !== undefined && current.length < schema.minLength) errors.push({ path, message: 'Too short' });
      if (schema.maxLength !== undefined && current.length > schema.maxLength) errors.push({ path, message: 'Too long' });
      if (schema.pattern && !(new RegExp(schema.pattern).test(current))) errors.push({ path, message: 'Pattern mismatch' });
    }
    if (Array.isArray(current)) {
      if (schema.minItems !== undefined && current.length < schema.minItems) errors.push({ path, message: 'Too few items' });
      if (schema.items) current.forEach((item, index) => check(schema.items, item, path + '/' + index));
    }
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      for (const key of schema.required ?? []) {
        if (!Object.prototype.hasOwnProperty.call(current, key)) {
          errors.push({ path: path + '/' + key, message: 'Required property missing' });
        }
      }
      for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          check(propertySchema, current[key], path + '/' + key);
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(current)) {
          if (!(key in (schema.properties ?? {}))) errors.push({ path: path + '/' + key, message: 'Additional property' });
        }
      }
    }
  }

  check(rootSchema, value, '');
  return { valid: errors.length === 0, errors };
}

const assert = require('node:assert/strict');
const schema = {
  $defs: {
    address: {
      type: 'object',
      required: ['city'],
      properties: { city: { type: 'string', minLength: 2 } }
    }
  },
  type: 'object',
  required: ['name', 'age', 'address'],
  properties: {
    name: { type: 'string', pattern: '^[A-Z]' },
    age: { type: 'integer', minimum: 18 },
    address: { $ref: '#/$defs/address' },
    tags: { type: 'array', items: { type: 'string' } }
  },
  additionalProperties: false
};
assert.equal(validateSchema(schema, {
  name: 'Ada', age: 36, address: { city: 'London' }, tags: ['math']
}).valid, true);
const invalid = validateSchema(schema, {
  name: 'ada', age: 12, address: {}, extra: true
});
assert.equal(invalid.valid, false);
assert.ok(invalid.errors.length >= 4);
console.log('JSON Schema validator tests passed');

module.exports = { validateSchema };
