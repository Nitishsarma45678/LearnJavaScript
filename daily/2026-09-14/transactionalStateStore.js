// Practice: closure-based transactional state store with immutable updates,
// undo/redo history, selectors, and subscriber notifications.

function createStore(initialState, equality = Object.is) {
  let state = structuredClone(initialState);
  let past = [];
  let future = [];
  const subscribers = new Set();

  const clone = (value) => structuredClone(value);

  function notify(previousState) {
    for (const listener of subscribers) {
      listener(state, previousState);
    }
  }

  function commit(updater) {
    const previous = state;
    const next = clone(updater(clone(state)));

    if (equality(previous, next)) return false;

    past.push(previous);
    state = next;
    future = [];
    notify(previous);
    return true;
  }

  function undo() {
    if (past.length === 0) return false;

    const previous = state;
    future.push(previous);
    state = past.pop();
    notify(previous);
    return true;
  }

  function redo() {
    if (future.length === 0) return false;

    const previous = state;
    past.push(previous);
    state = future.pop();
    notify(previous);
    return true;
  }

  return Object.freeze({
    getState: () => clone(state),
    update: commit,
    undo,
    redo,
    select: (selector) => selector(clone(state)),
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    history: () => ({ past: past.length, future: future.length }),
  });
}

const store = createStore({
  cart: [],
  user: { name: "Nit", premium: false },
});

const unsubscribe = store.subscribe((next, previous) => {
  console.log("State changed:", previous, "=>", next);
});

store.update((draft) => {
  draft.cart.push({ id: 1, name: "Keyboard", price: 80, quantity: 1 });
  return draft;
});

store.update((draft) => {
  draft.cart[0].quantity += 2;
  draft.user.premium = true;
  return draft;
});

const total = store.select((state) =>
  state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

console.log("Cart total:", total);
console.log("History:", store.history());

store.undo();
console.log("After undo:", store.getState());

store.redo();
console.log("After redo:", store.getState());

unsubscribe();
