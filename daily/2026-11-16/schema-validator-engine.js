'use strict';

/**
 * Exercise: implement a recursive JSON Schema subset validator.
 *
 * Supported keywords: $ref (local JSON Pointer), type, const, enum, allOf,
 * anyOf, oneOf, not, if/then/else, properties, required,
 * additionalProperties, items, min/maxItems, uniqueItems, min/maxProperties,
 * min/maxLength, pattern, minimum/maximum, exclusiveMinimum/
 * exclusiveMaximum, and multipleOf. Errors include keyword and instancePath.
 *
 * This intentionally implements a documented subset, not full Draft 2020-12.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function jsonTypeMatches(value, type) {
  switch (type) {
    case 'null': return value === null;
    case 'array': return Array.isArray(value);
    case 'object': return isPlainObject(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isSafeInteger(value);
    default: throw new TypeError(`unsupported schema type: ${type}`);
  }
}

function deepEqual(a, b, seen = new WeakMap()) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  let paired = seen.get(a);
  if (paired && paired.has(b)) return true;
  if (!paired) seen.set(a, paired = new WeakSet());
  paired.add(b);
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every(key =>
    Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key], seen));
}

function pointerEscape(part) {
  return String(part).replace(/~/g, '~0').replace(/\//g, '~1');
}

function resolveLocalRef(root, ref) {
  if (ref === '#') return root;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) throw new Error(`unsupported reference: ${ref}`);
  return ref.slice(2).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((value, part) => {
      if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) {
        throw new Error(`unresolved reference: ${ref}`);
      }
      return value[part];
    }, root);
}

class SchemaValidator {
  validate(instance, schema) {
    const errors = [];
    this._visit(instance, schema, '', schema, errors, new WeakMap());
    return { valid: errors.length === 0, errors };
  }

  _error(errors, path, keyword, message) {
    errors.push({ instancePath: path, keyword, message });
  }

  _visit(value, schema, path, root, errors, active) {
    if (schema === true) return;
    if (schema === false) {
      this._error(errors, path, 'falseSchema', 'value is rejected by the false schema');
      return;
    }
    if (!isPlainObject(schema)) throw new TypeError('schema nodes must be objects or booleans');

    const track = value !== null && typeof value === 'object';
    if (track) {
      let values = active.get(schema);
      if (!values) active.set(schema, values = new WeakSet());
      if (values.has(value)) return; // recursive schema/data pair already being checked
      values.add(value);
    }

    try {
      if (Object.prototype.hasOwnProperty.call(schema, '$ref')) {
        let target;
        try { target = resolveLocalRef(root, schema.$ref); }
        catch (error) {
          this._error(errors, path, '$ref', error.message);
          target = true;
        }
        this._visit(value, target, path, root, errors, active);
      }

      if (schema.type !== undefined) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        const matches = types.some(type => jsonTypeMatches(value, type));
        if (!matches) {
          this._error(errors, path, 'type', `expected ${types.join(' or ')}`);
          return;
        }
      }

      if (Object.prototype.hasOwnProperty.call(schema, 'const') && !deepEqual(value, schema.const)) {
        this._error(errors, path, 'const', 'value does not equal the required constant');
      }
      if (Array.isArray(schema.enum) && !schema.enum.some(item => deepEqual(value, item))) {
        this._error(errors, path, 'enum', 'value is not one of the allowed values');
      }

      for (const child of schema.allOf || []) this._visit(value, child, path, root, errors, active);
      if (Array.isArray(schema.anyOf)) {
        const successes = schema.anyOf.filter(child => this._isValid(value, child, root));
        if (successes.length === 0) this._error(errors, path, 'anyOf', 'value must match at least one branch');
      }
      if (Array.isArray(schema.oneOf)) {
        const matches = schema.oneOf.filter(child => this._isValid(value, child, root)).length;
        if (matches !== 1) this._error(errors, path, 'oneOf', `value matched ${matches} branches; expected exactly one`);
      }
      if (schema.not !== undefined && this._isValid(value, schema.not, root)) {
        this._error(errors, path, 'not', 'value matches a forbidden schema');
      }
      if (schema.if !== undefined) {
        const branch = this._isValid(value, schema.if, root) ? schema.then : schema.else;
        if (branch !== undefined) this._visit(value, branch, path, root, errors, active);
      }

      if (typeof value === 'string') this._validateString(value, schema, path, errors);
      if (typeof value === 'number' && Number.isFinite(value)) this._validateNumber(value, schema, path, errors);
      if (Array.isArray(value)) this._validateArray(value, schema, path, root, errors, active);
      if (isPlainObject(value)) this._validateObject(value, schema, path, root, errors, active);
    } finally {
      if (track) active.get(schema).delete(value);
    }
  }

  _isValid(value, schema, root) {
    const errors = [];
    this._visit(value, schema, '', root, errors, new WeakMap());
    return errors.length === 0;
  }

  _validateString(value, schema, path, errors) {
    const length = [...value].length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      this._error(errors, path, 'minLength', `length must be at least ${schema.minLength}`);
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      this._error(errors, path, 'maxLength', `length must be at most ${schema.maxLength}`);
    }
    if (schema.pattern !== undefined) {
      let pattern;
      try { pattern = new RegExp(schema.pattern, 'u'); }
      catch { throw new TypeError(`invalid regular expression: ${schema.pattern}`); }
      if (!pattern.test(value)) this._error(errors, path, 'pattern', `string does not match ${schema.pattern}`);
    }
  }

  _validateNumber(value, schema, path, errors) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      this._error(errors, path, 'minimum', `must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      this._error(errors, path, 'maximum', `must be <= ${schema.maximum}`);
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      this._error(errors, path, 'exclusiveMinimum', `must be > ${schema.exclusiveMinimum}`);
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      this._error(errors, path, 'exclusiveMaximum', `must be < ${schema.exclusiveMaximum}`);
    }
    if (schema.multipleOf !== undefined) {
      if (!(schema.multipleOf > 0)) throw new TypeError('multipleOf must be positive');
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-10 * Math.max(1, Math.abs(quotient))) {
        this._error(errors, path, 'multipleOf', `must be a multiple of ${schema.multipleOf}`);
      }
    }
  }

  _validateArray(value, schema, path, root, errors, active) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      this._error(errors, path, 'minItems', `must contain at least ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      this._error(errors, path, 'maxItems', `must contain at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      for (let i = 0; i < value.length; i++) {
        if (value.slice(0, i).some(item => deepEqual(item, value[i]))) {
          this._error(errors, path, 'uniqueItems', `duplicate item at index ${i}`);
          break;
        }
      }
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => this._visit(item, schema.items,
        `${path}/${index}`, root, errors, active));
    }
  }

  _validateObject(value, schema, path, root, errors, active) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      this._error(errors, path, 'minProperties', `must have at least ${schema.minProperties} properties`);
    }
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) {
      this._error(errors, path, 'maxProperties', `must have at most ${schema.maxProperties} properties`);
    }
    for (const name of schema.required || []) {
      if (!Object.prototype.hasOwnProperty.call(value, name)) {
        this._error(errors, path, 'required', `missing required property ${JSON.stringify(name)}`);
      }
    }
    const properties = schema.properties || {};
    for (const [name, child] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, name)) {
        this._visit(value[name], child, `${path}/${pointerEscape(name)}`, root, errors, active);
      }
    }
    for (const name of keys) {
      if (Object.prototype.hasOwnProperty.call(properties, name)) continue;
      if (schema.additionalProperties === false) {
        this._error(errors, `${path}/${pointerEscape(name)}`, 'additionalProperties', 'property is not allowed');
      } else if (schema.additionalProperties !== undefined && schema.additionalProperties !== true) {
        this._visit(value[name], schema.additionalProperties,
          `${path}/${pointerEscape(name)}`, root, errors, active);
      }
    }
  }
}

module.exports = { SchemaValidator, resolveLocalRef };

if (require.main === module) {
  const assert = require('node:assert/strict');
  const validator = new SchemaValidator();
  const userSchema = {
    type: 'object',
    required: ['id', 'email', 'roles'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
      roles: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['reader', 'writer', 'admin'] } }
    },
    additionalProperties: false
  };
  const good = { id: 12, email: 'dev@example.com', roles: ['reader', 'writer'] };
  assert.equal(validator.validate(good, userSchema).valid, true);
  const bad = validator.validate({ id: 0, email: 'nope', roles: ['reader', 'reader'], extra: true }, userSchema);
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.some(error => error.keyword === 'minimum'));
  assert.ok(bad.errors.some(error => error.keyword === 'pattern'));
  assert.ok(bad.errors.some(error => error.keyword === 'uniqueItems'));
  assert.ok(bad.errors.some(error => error.keyword === 'additionalProperties'));

  const recursive = {
    $defs: { node: { type: 'object', required: ['value'], properties: {
      value: { type: 'number' }, children: { type: 'array', items: { $ref: '#/$defs/node' } }
    }, additionalProperties: false } },
    $ref: '#/$defs/node'
  };
  assert.equal(validator.validate({ value: 1, children: [{ value: 2 }] }, recursive).valid, true);
  const cyclic = { value: 1, children: [] };
  cyclic.children.push(cyclic); // recursive object graph terminates safely
  assert.equal(validator.validate(cyclic, recursive).valid, true);

  assert.equal(validator.validate('x', { anyOf: [{ type: 'number' }, { type: 'string' }] }).valid, true);
  assert.equal(validator.validate(3, { oneOf: [{ type: 'number' }, { minimum: 2 }] }).valid, false);
  assert.equal(validator.validate(4, { allOf: [{ minimum: 2 }, { maximum: 5 }] }).valid, true);
  assert.equal(validator.validate(4, { not: { type: 'string' } }).valid, true);
  assert.equal(validator.validate(5, { if: { minimum: 5 }, then: { maximum: 10 }, else: { maximum: 4 } }).valid, true);
  assert.equal(validator.validate('😀', { minLength: 1, maxLength: 1 }).valid, true);
  assert.equal(validator.validate({ 'a/b': 2 }, { properties: { 'a/b': { type: 'string' } } }).errors[0].instancePath, '/a~1b');
  assert.equal(validator.validate(5, { $ref: '#/missing' }).valid, false);
  console.log('Schema validator tests passed');
}
