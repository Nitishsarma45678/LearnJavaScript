// Daily JavaScript practice — 2026-09-07
// Transactional state machine with rollback semantics.

function createMachine(initialState, transitions) {
  let state = structuredClone(initialState);
  const history = [];

  return {
    getState: () => structuredClone(state),

    transition(action) {
      const handler = transitions[action.type];
      if (!handler) throw new Error(`Unsupported action: ${action.type}`);

      const previous = structuredClone(state);
      try {
        const next = handler(structuredClone(state), action);
        if (!next || typeof next !== "object") throw new Error("Invalid next state");
        history.push(previous);
        state = next;
        return this.getState();
      } catch (error) {
        state = previous;
        throw new Error(`Transaction aborted: ${error.message}`);
      }
    },

    rollback() {
      if (!history.length) return this.getState();
      state = history.pop();
      return this.getState();
    }
  };
}

const account = createMachine(
  { balance: 1000, locked: false },
  {
    DEBIT(state, { amount }) {
      if (state.locked) throw new Error("Account is locked");
      if (amount <= 0 || amount > state.balance) throw new Error("Invalid debit");
      return { ...state, balance: state.balance - amount };
    },
    LOCK(state) {
      return { ...state, locked: true };
    }
  }
);

account.transition({ type: "DEBIT", amount: 250 });
account.transition({ type: "LOCK" });
console.log(account.getState());

try {
  account.transition({ type: "DEBIT", amount: 100 });
} catch (error) {
  console.log(error.message);
}

console.log("After rollback:", account.rollback());
