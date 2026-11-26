'use strict';

// Exercise: implement a small Immer-like produce() for plain objects and arrays.
// Unchanged branches retain identity; only modified paths are shallow-copied.

const assert = require('node:assert/strict');

function isDraftable(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function shallowCopy(value) {
  return Array.isArray(value)
    ? value.slice()
    : Object.assign(Object.create(Object.getPrototypeOf(value)), value);
}

function produce(base, recipe) {
  if (!isDraftable(base) || typeof recipe !== 'function') {
    throw new TypeError('base must be a plain object or array and recipe must be a function');
  }

  function createState(value, parent = null, parentKey = null) {
    const state = {
      base: value, copy: null, modified: false, parent, parentKey, drafts: new Map(), proxy: null
    };

    function markChanged(current) {
      if (current.modified) return;
      current.modified = true;
      current.copy = shallowCopy(current.base);
      if (current.parent) markChanged(current.parent);
    }

    state.proxy = new Proxy(value, {
      get(_target, key) {
        const source = state.copy || state.base;
        const child = Reflect.get(source, key);
        if (!isDraftable(child)) return child;
        if (!state.drafts.has(key) || state.drafts.get(key).base !== child) {
          state.drafts.set(key, createState(child, state, key));
        }
        return state.drafts.get(key).proxy;
      },
      set(_target, key, nextValue) {
        const source = state.copy || state.base;
        if (Object.is(source[key], nextValue) &&
            Object.prototype.hasOwnProperty.call(source, key)) return true;
        markChanged(state);
        state.drafts.delete(key);
        return Reflect.set(state.copy, key, nextValue);
      },
      deleteProperty(_target, key) {
        const source = state.copy || state.base;
        if (!Object.prototype.hasOwnProperty.call(source, key)) return true;
        markChanged(state);
        state.drafts.delete(key);
        return Reflect.deleteProperty(state.copy, key);
      },
      defineProperty(_target, key, descriptor) {
        markChanged(state);
        state.drafts.delete(key);
        return Reflect.defineProperty(state.copy, key, descriptor);
      },
      has(_target, key) {
        return Reflect.has(state.copy || state.base, key);
      },
      ownKeys() {
        return Reflect.ownKeys(state.copy || state.base);
      },
      getOwnPropertyDescriptor(_target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(state.copy || state.base, key);
        if (!descriptor) return undefined;
        if (Array.isArray(state.base) && key === 'length') return descriptor;
        return { ...descriptor, configurable: true };
      }
    });

    return state;
  }

  function finalize(state) {
    if (!state.modified) return state.base;
    for (const [key, child] of state.drafts) {
      const value = finalize(child);
      if (value !== child.base) state.copy[key] = value;
    }
    return state.copy;
  }

  const root = createState(base);
  const replacement = recipe(root.proxy);
  if (replacement !== undefined) {
    if (root.modified) throw new Error('recipe cannot both mutate a draft and return a replacement');
    return replacement;
  }
  return finalize(root);
}

const base = {
  user: { name: 'Ada', tags: ['math', 'logic'] },
  settings: { theme: 'dark' }
};
const next = produce(base, (draft) => {
  draft.user.name = 'Grace';
  draft.user.tags.push('compiler');
});
assert.equal(next.user.name, 'Grace');
assert.deepEqual(next.user.tags, ['math', 'logic', 'compiler']);
assert.notStrictEqual(next, base);
assert.notStrictEqual(next.user, base.user);
assert.strictEqual(next.settings, base.settings);
assert.strictEqual(next.user.tags === base.user.tags, false);

const unchanged = produce(base, (draft) => { void draft.user.name; });
assert.strictEqual(unchanged, base);
assert.deepEqual(produce(base, () => ({ replacement: true })), { replacement: true });
assert.throws(() => produce(base, (draft) => { draft.user.name = 'X'; return {}; }), /both mutate/);

module.exports = { produce };
