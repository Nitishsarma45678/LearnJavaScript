"use strict";

const assert = require("node:assert/strict");

function getDefinition(definitions, name) {
  if (!Object.hasOwn(definitions, name)) {
    throw new Error("unknown class: " + name);
  }
  const definition = definitions[name];
  if (definition === null || typeof definition !== "object") {
    throw new TypeError("class definition must be an object: " + name);
  }
  return definition;
}

/**
 * Compute the C3 linearization (method resolution order) for a class graph.
 *
 * A definition has the shape:
 *   Name: { parents: ["ParentA", "ParentB"], methods: { run() {} } }
 *
 * C3 preserves local parent order and monotonicity. It rejects inheritance
 * graphs whose parent constraints cannot be satisfied consistently.
 */
function linearize(className, definitions, memo = new Map(), active = new Set()) {
  if (memo.has(className)) return memo.get(className).slice();
  if (active.has(className)) throw new Error("inheritance cycle at " + className);

  const definition = getDefinition(definitions, className);
  const parents = definition.parents ?? [];
  if (!Array.isArray(parents)) throw new TypeError("parents must be an array");
  if (new Set(parents).size !== parents.length) {
    throw new Error("duplicate direct parent in " + className);
  }

  active.add(className);
  try {
    const sequences = parents.map((parent) =>
      linearize(parent, definitions, memo, active)
    );
    sequences.push(parents.slice());

    const merged = [];

    while (sequences.some((sequence) => sequence.length > 0)) {
      let candidate;

      for (const sequence of sequences) {
        if (sequence.length === 0) continue;
        const head = sequence[0];
        const appearsInTail = sequences.some((other) => other.slice(1).includes(head));

        if (!appearsInTail) {
          candidate = head;
          break;
        }
      }

      if (candidate === undefined) {
        throw new Error("inconsistent C3 hierarchy for " + className);
      }

      merged.push(candidate);
      for (const sequence of sequences) {
        if (sequence[0] === candidate) sequence.shift();
      }
    }

    const result = [className, ...merged];
    memo.set(className, result);
    return result.slice();
  } finally {
    active.delete(className);
  }
}

function instantiate(className, definitions) {
  const mro = linearize(className, definitions);
  const instance = { className };
  Object.defineProperty(instance, "mro", {
    value: Object.freeze(mro.slice()),
    enumerable: true
  });

  const findMethod = (methodName, startIndex) => {
    if (typeof methodName !== "string") throw new TypeError("method name must be a string");

    for (let index = startIndex; index < mro.length; index += 1) {
      const owner = mro[index];
      const methods = getDefinition(definitions, owner).methods ?? {};

      if (Object.hasOwn(methods, methodName)) {
        if (typeof methods[methodName] !== "function") {
          throw new TypeError(owner + "." + methodName + " must be a function");
        }
        return { owner, method: methods[methodName] };
      }
    }

    return null;
  };

  Object.defineProperties(instance, {
    invoke: {
      enumerable: false,
      value(methodName, ...args) {
        const found = findMethod(methodName, 0);
        if (!found) throw new Error("method not found: " + methodName);
        return found.method.apply(instance, args);
      }
    },
    callNext: {
      enumerable: false,
      value(methodName, afterClassName, ...args) {
        const position = mro.indexOf(afterClassName);
        if (position < 0) {
          throw new Error(afterClassName + " is not in this instance's MRO");
        }

        const found = findMethod(methodName, position + 1);
        if (!found) throw new Error("no next implementation for " + methodName);
        return found.method.apply(instance, args);
      }
    }
  });

  return instance;
}

// Diamond inheritance: C -> A -> B -> O, with cooperative next-method calls.
const hierarchy = {
  O: {
    parents: [],
    methods: {
      label() {
        return "O";
      }
    }
  },
  A: {
    parents: ["O"],
    methods: {
      label() {
        return "A>" + this.callNext("label", "A");
      }
    }
  },
  B: {
    parents: ["O"],
    methods: {
      label() {
        return "B>" + this.callNext("label", "B");
      }
    }
  },
  C: {
    parents: ["A", "B"],
    methods: {
      label() {
        return "C>" + this.callNext("label", "C");
      }
    }
  }
};

const instance = instantiate("C", hierarchy);
assert.deepEqual(instance.mro, ["C", "A", "B", "O"]);
assert.equal(instance.invoke("label"), "C>A>B>O");
assert.throws(() => instance.invoke("missing"), /not found/);
assert.throws(() => instance.callNext("label", "Unknown"), /not in this instance/);

// C3 must reject a hierarchy that imposes contradictory parent orders.
const inconsistent = {
  O: { parents: [] },
  X: { parents: ["O"] },
  Y: { parents: ["O"] },
  A: { parents: ["X", "Y"] },
  B: { parents: ["Y", "X"] },
  Z: { parents: ["A", "B"] }
};
assert.throws(() => linearize("Z", inconsistent), /inconsistent C3 hierarchy/);

// Unknown parents and cycles are rejected instead of producing partial MROs.
assert.throws(() => linearize("Child", {
  Child: { parents: ["Missing"] }
}), /unknown class/);
assert.throws(() => linearize("Left", {
  Left: { parents: ["Right"] },
  Right: { parents: ["Left"] }
}), /inheritance cycle/);

module.exports = { linearize, instantiate };
