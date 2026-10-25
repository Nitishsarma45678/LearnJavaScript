/**
 * Tiny observable store with immutable updates and unsubscribe support.
 */
function createStore(initialState, reducer) {
  let state = initialState;
  const listeners = new Set();
  if (typeof reducer !== "function") throw new TypeError("reducer must be a function");

  return {
    getState: () => state,
    dispatch(action) {
      const next = reducer(state, action);
      if (Object.is(next, state)) return state;
      state = next;
      for (const listener of [...listeners]) listener(state, action);
      return state;
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("listener must be a function");
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

const store = createStore({ count: 0 }, (state, action) => {
  if (action.type === "increment") return { ...state, count: state.count + 1 };
  if (action.type === "reset") return { ...state, count: 0 };
  return state;
});
let notifications = 0;
const unsubscribe = store.subscribe(state => { notifications++; console.assert(state.count >= 0); });
store.dispatch({ type: "increment" });
store.dispatch({ type: "increment" });
unsubscribe();
store.dispatch({ type: "reset" });
console.assert(store.getState().count === 0 && notifications === 2);
console.log("observable store practice passed");
