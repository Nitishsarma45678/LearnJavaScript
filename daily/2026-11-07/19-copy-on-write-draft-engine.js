'use strict';

/**
 * Exercise: implement a small copy-on-write draft engine using JavaScript Proxy.
 *
 * Support nested objects/arrays, structural sharing, replacement results,
 * property deletion, JSON-patch-like set/delete operations, inverse patches,
 * and patch replay. Recipes are synchronous and drafts are revoked afterward.
 *
 * Supported values: arrays and plain objects with ordinary data properties.
 * Run: node 19-copy-on-write-draft-engine.js
 */

const assert = require('node:assert/strict');
const DRAFT_STATE = Symbol('draft-state');
const stateByProxy = new WeakMap();

function isDraftable(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function shallowCopy(value) {
  if (Array.isArray(value)) return value.slice();
  return Object.assign(Object.create(Object.getPrototypeOf(value)), value);
}

function createDraft(base, parent, parentKey, context) {
  const state = {
    base, copy: null, parent, parentKey, modified: false,
    revoked: false, drafts: new Map(), proxy: null
  };

  const assertLive = () => {
    if (state.revoked) throw new Error('draft has been finalized');
  };

  const markChanged = () => {
    if (state.modified) return;
    state.modified = true;
    state.copy = shallowCopy(state.base);
    if (state.parent) markStateChanged(state.parent);
  };

  const latest = () => state.copy || state.base;
  const handlers = {
    get(_target, key, receiver) {
      assertLive();
      if (key === DRAFT_STATE) return state;
      const value = Reflect.get(latest(), key, receiver);
      if (!isDraftable(value)) return value;
      if (state.drafts.has(key)) return state.drafts.get(key).proxy;
      const child = createDraft(value, state, key, context);
      state.drafts.set(key, child);
      return child.proxy;
    },

    set(_target, key, value) {
      assertLive();
      const existingDraft = state.drafts.get(key);
      if (existingDraft && existingDraft.proxy === value) return true;
      const current = Reflect.get(latest(), key);
      if (Object.is(current, value)) return true;
      markChanged();
      state.drafts.delete(key);
      return Reflect.set(state.copy, key, value, state.copy);
    },

    deleteProperty(_target, key) {
      assertLive();
      const descriptor = Reflect.getOwnPropertyDescriptor(latest(), key);
      if (!descriptor) return true;
      if (!descriptor.configurable) return false;
      markChanged();
      state.drafts.delete(key);
      return Reflect.deleteProperty(state.copy, key);
    },

    has(_target, key) {
      assertLive();
      return Reflect.has(latest(), key);
    },

    ownKeys() {
      assertLive();
      return Reflect.ownKeys(latest());
    },

    getOwnPropertyDescriptor(_target, key) {
      assertLive();
      return Reflect.getOwnPropertyDescriptor(latest(), key);
    }
  };

  state.proxy = new Proxy(base, handlers);
  stateByProxy.set(state.proxy, state);
  context.states.push(state);
  return state;
}

function markStateChanged(state) {
  if (state.modified) return;
  state.modified = true;
  state.copy = shallowCopy(state.base);
  if (state.parent) markStateChanged(state.parent);
}

function finalizeState(state) {
  if (!state.modified) return state.base;
  const result = state.copy;

  for (const [key, child] of state.drafts) {
    if (Reflect.has(result, key)) {
      const value = finalizeState(child);
      if (!Reflect.set(result, key, value, result)) {
        throw new TypeError('cannot finalize a modified non-writable property');
      }
    }
  }

  for (const key of Reflect.ownKeys(result)) {
    const value = result[key];
    const assignedDraft = value && typeof value === 'object' ? stateByProxy.get(value) : null;
    if (assignedDraft) result[key] = finalizeState(assignedDraft);
  }
  return result;
}

function diffValues(before, after, path = [], patches = [], inverse = []) {
  if (Object.is(before, after)) return;

  if (isDraftable(before) && isDraftable(after) &&
      Object.getPrototypeOf(before) === Object.getPrototypeOf(after)) {
    const beforeKeys = Reflect.ownKeys(before).filter(key => !(Array.isArray(before) && key === 'length'));
    const afterKeys = Reflect.ownKeys(after).filter(key => !(Array.isArray(after) && key === 'length'));
    const beforeSet = new Set(beforeKeys);
    const afterSet = new Set(afterKeys);

    for (const key of beforeKeys) {
      if (!afterSet.has(key)) {
        patches.push({ op: 'delete', path: [...path, key] });
        inverse.unshift({ op: 'set', path: [...path, key], value: before[key] });
      } else {
        diffValues(before[key], after[key], [...path, key], patches, inverse);
      }
    }

    for (const key of afterKeys) {
      if (!beforeSet.has(key)) {
        patches.push({ op: 'set', path: [...path, key], value: after[key] });
        inverse.unshift({ op: 'delete', path: [...path, key] });
      }
    }

    if (Array.isArray(before) && before.length !== after.length) {
      patches.push({ op: 'set', path: [...path, 'length'], value: after.length });
      inverse.unshift({ op: 'set', path: [...path, 'length'], value: before.length });
    }
    return;
  }

  patches.push({ op: 'set', path, value: after });
  inverse.unshift({ op: 'set', path, value: before });
}

function produceWithPatches(base, recipe) {
  if (!isDraftable(base)) throw new TypeError('base must be an array or plain object');
  if (typeof recipe !== 'function') throw new TypeError('recipe must be a function');

  const context = { states: [] };
  const root = createDraft(base, null, null, context);
  let replacement;
  try {
    replacement = recipe(root.proxy);
    if (replacement && typeof replacement.then === 'function') {
      throw new TypeError('async recipes are not supported');
    }
    if (replacement !== undefined && replacement !== root.proxy && root.modified) {
      throw new Error('a recipe cannot both mutate and return a replacement');
    }
    const value = replacement !== undefined && replacement !== root.proxy
      ? replacement
      : finalizeState(root);
    const patches = [], inversePatches = [];
    diffValues(base, value, [], patches, inversePatches);
    return { value, patches, inversePatches };
  } finally {
    for (const state of context.states) state.revoked = true;
  }
}

function produce(base, recipe) {
  return produceWithPatches(base, recipe).value;
}

function applyPatches(base, patches) {
  let result = base;
  for (const patch of patches) {
    if (!patch.path.length) {
      if (patch.op !== 'set') throw new Error('cannot delete the root value');
      result = patch.value;
      continue;
    }

    const path = patch.path;
    const update = (current, depth) => {
      if (!isDraftable(current)) throw new TypeError('patch path crosses a non-container');
      const copy = shallowCopy(current);
      const key = path[depth];
      if (depth === path.length - 1) {
        if (patch.op === 'set') copy[key] = patch.value;
        else if (patch.op === 'delete') delete copy[key];
        else throw new Error('unknown patch operation: ' + patch.op);
      } else {
        copy[key] = update(current[key], depth + 1);
      }
      return copy;
    };
    result = update(result, 0);
  }
  return result;
}

function runTests() {
  const base = {
    user: { name: 'Ada', tags: ['math', 'code'] },
    settings: { theme: 'dark' },
    untouched: { stable: true }
  };

  const result = produceWithPatches(base, draft => {
    draft.user.name = 'Grace';
    draft.user.tags.push('systems');
    draft.settings.theme = 'light';
    draft.extra = 7;
  });

  assert.equal(base.user.name, 'Ada');
  assert.deepEqual(base.user.tags, ['math', 'code']);
  assert.equal(result.value.user.name, 'Grace');
  assert.deepEqual(result.value.user.tags, ['math', 'code', 'systems']);
  assert.equal(result.value.settings.theme, 'light');
  assert.equal(result.value.extra, 7);
  assert.equal(result.value.untouched, base.untouched);
  assert.deepEqual(applyPatches(base, result.patches), result.value);
  assert.deepEqual(applyPatches(result.value, result.inversePatches), base);

  const noChange = produceWithPatches(base, () => {});
  assert.equal(noChange.value, base);
  assert.equal(noChange.patches.length, 0);

  const deleted = produce(base, draft => {
    delete draft.user.name;
    draft.user.tags.splice(0, 1);
  });
  assert.equal(Object.hasOwn(deleted.user, 'name'), false);
  assert.deepEqual(deleted.user.tags, ['code']);

  const replacement = produce(base, () => ({ replacement: true }));
  assert.deepEqual(replacement, { replacement: true });
  assert.throws(() => produce(base, draft => {
    draft.user.name = 'Lin';
    return { other: true };
  }), /both mutate and return/);
  assert.throws(() => produce(base, draft => {
    draft.user.name = 'Lin';
    return Promise.resolve();
  }), /async recipes/);

  let escaped;
  produce(base, draft => { escaped = draft; });
  assert.throws(() => escaped.user, /finalized/);
}

runTests();
module.exports = { produce, produceWithPatches, applyPatches };
