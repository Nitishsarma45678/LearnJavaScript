const assert = require('node:assert/strict');

function createObservableState(initialState) {
  if (initialState === null || typeof initialState !== 'object') {
    throw new TypeError('Initial state must be an object');
  }

  const listeners = new Set();
  const proxyCache = new WeakMap();

  function notify(event) {
    for (const listener of [...listeners]) listener(Object.freeze(event));
  }

  function wrap(target, path = []) {
    if (target === null || typeof target !== 'object') return target;
    if (proxyCache.has(target)) return proxyCache.get(target);

    const proxy = new Proxy(target, {
      get(object, key, receiver) {
        return wrap(Reflect.get(object, key, receiver), path.concat(key));
      },
      set(object, key, value) {
        const oldValue = object[key];
        if (Object.is(oldValue, value)) return true;
        const success = Reflect.set(object, key, value, object);
        if (success) notify({
          type: 'set',
          path: path.concat(key),
          oldValue,
          newValue: value
        });
        return success;
      },
      deleteProperty(object, key) {
        if (!Object.hasOwn(object, key)) return true;
        const oldValue = object[key];
        const success = Reflect.deleteProperty(object, key);
        if (success) notify({ type: 'delete', path: path.concat(key), oldValue });
        return success;
      }
    });

    proxyCache.set(target, proxy);
    return proxy;
  }

  return {
    state: wrap(initialState),
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('Listener must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

const { state, subscribe } = createObservableState({
  user: { name: 'Ada', score: 10 },
  flags: ['active']
});
const events = [];
const unsubscribe = subscribe(event => events.push(event));
state.user.score = 11;
state.flags.push('verified');
delete state.user.name;
assert.equal(events[0].type, 'set');
assert.deepEqual(events[0].path, ['user', 'score']);
assert.equal(events[0].oldValue, 10);
assert.equal(events[0].newValue, 11);
assert.ok(events.some(event => event.type === 'delete' && event.path.join('.') === 'user.name'));
assert.ok(events.some(event => event.path.join('.') === 'flags.1'));
unsubscribe();
state.user.score = 12;
assert.equal(events.length, 3); // No notifications after unsubscribe.
console.log('Observable state tests passed');