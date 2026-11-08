'use strict';

// Exercise: Create a small observable state container with selector-based
// subscriptions, synchronous nested transactions, rollback, and safe handling
// of re-entrant updates. State updates are shallow merges; callers should use
// immutable values for nested data.
//
// A successful outer transaction produces at most one notification pass.
// A thrown transaction rolls back its draft. Listener errors are routed to
// onError and do not prevent other listeners from running.

const assert = require('node:assert/strict');

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameShallow(a, b) {
  const keysA = Reflect.ownKeys(a);
  const keysB = Reflect.ownKeys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key =>
    Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key])
  );
}

function createObservableStore(initialState, options = {}) {
  if (!isPlainObject(initialState)) throw new TypeError('Initial state must be a plain object');
  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  let state = Object.freeze({ ...initialState });
  let draft = null;
  let transactionDepth = 0;
  let version = 0;
  let flushing = false;
  let pending = false;
  const subscribers = new Set();

  function reportError(error) {
    try { onError(error); } catch (_) { /* error reporting must not break dispatch */ }
  }

  function flush() {
    pending = true;
    if (flushing) return;
    flushing = true;
    try {
      while (pending) {
        pending = false;
        for (const subscriber of Array.from(subscribers)) {
          if (!subscriber.active) continue;
          let selected;
          try {
            selected = subscriber.selector(state);
          } catch (error) {
            reportError(error);
            continue;
          }
          if (subscriber.equality(selected, subscriber.value)) continue;

          const previous = subscriber.value;
          subscriber.value = selected;
          try {
            subscriber.listener(selected, previous, state, version);
          } catch (error) {
            reportError(error);
          }
        }
      }
    } finally {
      flushing = false;
    }
  }

  function commit(nextState) {
    if (sameShallow(state, nextState)) return;
    state = Object.freeze({ ...nextState });
    version += 1;
    flush();
  }

  function getState() {
    return transactionDepth > 0 ? Object.freeze({ ...draft }) : state;
  }

  function setState(update) {
    const base = transactionDepth > 0 ? draft : state;
    const current = Object.freeze({ ...base });
    const patch = typeof update === 'function' ? update(current) : update;
    if (!isPlainObject(patch)) throw new TypeError('setState expects a plain object patch');
    const next = { ...base, ...patch };

    if (transactionDepth > 0) {
      draft = next;
      return getState();
    }
    commit(next);
    return state;
  }

  function transaction(callback) {
    if (typeof callback !== 'function') throw new TypeError('transaction expects a function');
    const outermost = transactionDepth === 0;
    if (outermost) draft = { ...state };
    const savepoint = { ...draft };
    transactionDepth += 1;

    try {
      const result = callback(api);
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch(() => {});
        throw new TypeError('Transactions must be synchronous');
      }
      transactionDepth -= 1;
      if (transactionDepth === 0) {
        const committed = draft;
        draft = null;
        commit(committed);
      }
      return result;
    } catch (error) {
      transactionDepth -= 1;
      draft = savepoint;
      if (transactionDepth === 0) draft = null;
      throw error;
    }
  }

  function subscribe(listener, config = {}) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    const selector = config.selector || (value => value);
    const equality = config.equality || Object.is;
    if (typeof selector !== 'function' || typeof equality !== 'function') {
      throw new TypeError('selector and equality must be functions');
    }

    const subscriber = {
      listener,
      selector,
      equality,
      value: selector(state),
      active: true
    };
    subscribers.add(subscriber);

    if (config.fireImmediately) {
      try { listener(subscriber.value, undefined, state, version); }
      catch (error) { reportError(error); }
    }

    return () => {
      if (!subscriber.active) return false;
      subscriber.active = false;
      subscribers.delete(subscriber);
      return true;
    };
  }

  const api = {
    getState,
    setState,
    transaction,
    subscribe,
    getVersion: () => version
  };
  return api;
}

function runTests() {
  const listenerErrors = [];
  const store = createObservableStore(
    { count: 0, theme: 'dark' },
    { onError: error => listenerErrors.push(error.message) }
  );
  const countEvents = [];
  store.subscribe((next, previous) => countEvents.push([next, previous]), {
    selector: state => state.count
  });

  store.setState(state => ({ count: state.count + 1 }));
  store.transaction(api => {
    api.setState({ count: 2 });
    api.transaction(inner => inner.setState({ theme: 'light' }));
    api.setState({ extra: true });
  });
  assert.deepEqual(countEvents, [[1, 0], [2, 1]]);
  assert.equal(store.getVersion(), 2);
  assert.equal(store.getState().theme, 'light');

  assert.throws(() => store.transaction(api => {
    api.setState({ count: 99 });
    throw new Error('rollback');
  }), /rollback/);
  assert.equal(store.getState().count, 2);
  assert.equal(store.getVersion(), 2);

  assert.throws(() => store.transaction(async api => {
    api.setState({ count: 100 });
  }), /synchronous/);
  assert.equal(store.getState().count, 2);

  const reentrant = [];
  const unsubscribe = store.subscribe(value => {
    reentrant.push(value);
    if (value === 3) store.setState({ count: 4 });
  }, { selector: state => state.count });
  store.setState({ count: 3 });
  assert.deepEqual(reentrant, [3, 4]);
  assert.equal(store.getState().count, 4);
  assert.equal(unsubscribe(), true);
  assert.equal(unsubscribe(), false);

  store.subscribe(() => { throw new Error('listener failure'); }, {
    selector: state => state.theme
  });
  store.setState({ theme: 'contrast' });
  assert.deepEqual(listenerErrors, ['listener failure']);

  console.log('ObservableStore: all tests passed');
}

if (require.main === module) runTests();
module.exports = { createObservableStore };
