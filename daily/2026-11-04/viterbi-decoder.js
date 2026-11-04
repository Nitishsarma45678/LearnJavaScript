"use strict";

const assert = require("node:assert/strict");

/**
 * Decode the most likely hidden-state sequence for a discrete HMM.
 *
 * The algorithm uses log probabilities to avoid numerical underflow.
 * Missing probability entries are treated as zero. Probabilities must be
 * finite numbers in [0, 1]; distributions are not required to be normalized.
 *
 * Tie-breaking is deterministic: the first state in the supplied states
 * array wins when two candidates have equal log probability.
 *
 * @returns {{ path: string[] | null, logProbability: number, probability: number }}
 */
function viterbi({
  states,
  startProbability,
  transitionProbability,
  emissionProbability,
  observations
}) {
  if (!Array.isArray(states) || states.length === 0) {
    throw new TypeError("states must be a non-empty array");
  }
  if (new Set(states).size !== states.length ||
      states.some(state => typeof state !== "string")) {
    throw new TypeError("states must be unique strings");
  }
  if (!Array.isArray(observations)) {
    throw new TypeError("observations must be an array");
  }

  function readProbability(value, description) {
    if (value === undefined) return 0;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    ) {
      throw new RangeError(description + " must be in [0, 1]");
    }
    return value;
  }

  function own(object, key) {
    return object !== null &&
      typeof object === "object" &&
      Object.prototype.hasOwnProperty.call(object, key);
  }

  function lookup(table, row, column, description) {
    const rowValue = own(table, row) ? table[row] : undefined;
    const value = own(rowValue, column) ? rowValue[column] : undefined;
    return readProbability(value, description);
  }

  function logProbability(probability) {
    return probability === 0 ? -Infinity : Math.log(probability);
  }

  if (observations.length === 0) {
    return { path: [], logProbability: 0, probability: 1 };
  }

  let previous = states.map(state =>
    logProbability(lookup(
      { start: startProbability || {} },
      "start",
      state,
      "start probability"
    )) +
    logProbability(lookup(
      emissionProbability,
      state,
      observations[0],
      "emission probability"
    ))
  );

  const backpointers = [Array(states.length).fill(-1)];

  for (let time = 1; time < observations.length; time += 1) {
    const current = Array(states.length).fill(-Infinity);
    const back = Array(states.length).fill(-1);

    for (let nextIndex = 0; nextIndex < states.length; nextIndex += 1) {
      const nextState = states[nextIndex];
      let bestScore = -Infinity;
      let bestPrevious = -1;

      for (let previousIndex = 0; previousIndex < states.length; previousIndex += 1) {
        const transition = lookup(
          transitionProbability,
          states[previousIndex],
          nextState,
          "transition probability"
        );
        const score = previous[previousIndex] + logProbability(transition);

        if (score > bestScore) {
          bestScore = score;
          bestPrevious = previousIndex;
        }
      }

      const emission = lookup(
        emissionProbability,
        nextState,
        observations[time],
        "emission probability"
      );

      current[nextIndex] = bestScore + logProbability(emission);
      back[nextIndex] = bestPrevious;
    }

    previous = current;
    backpointers.push(back);
  }

  let bestFinal = -1;
  let bestLogProbability = -Infinity;
  for (let i = 0; i < states.length; i += 1) {
    if (previous[i] > bestLogProbability) {
      bestLogProbability = previous[i];
      bestFinal = i;
    }
  }

  if (bestFinal === -1 || bestLogProbability === -Infinity) {
    return {
      path: null,
      logProbability: -Infinity,
      probability: 0
    };
  }

  const path = Array(observations.length);
  let currentIndex = bestFinal;

  for (let time = observations.length - 1; time >= 0; time -= 1) {
    path[time] = states[currentIndex];
    if (time > 0) currentIndex = backpointers[time][currentIndex];
  }

  return {
    path,
    logProbability: bestLogProbability,
    probability: Math.exp(bestLogProbability)
  };
}

// Classic two-state weather HMM.
const weather = {
  states: ["Rainy", "Sunny"],
  startProbability: { Rainy: 0.6, Sunny: 0.4 },
  transitionProbability: {
    Rainy: { Rainy: 0.7, Sunny: 0.3 },
    Sunny: { Rainy: 0.4, Sunny: 0.6 }
  },
  emissionProbability: {
    Rainy: { walk: 0.1, shop: 0.4, clean: 0.5 },
    Sunny: { walk: 0.6, shop: 0.3, clean: 0.1 }
  }
};

const decoded = viterbi({
  ...weather,
  observations: ["walk", "shop", "clean"]
});
assert.deepEqual(decoded.path, ["Sunny", "Rainy", "Rainy"]);
assert.ok(decoded.probability > 0);
assert.ok(Number.isFinite(decoded.logProbability));

assert.deepEqual(viterbi({
  ...weather,
  observations: []
}), {
  path: [],
  logProbability: 0,
  probability: 1
});

const impossible = viterbi({
  states: ["A", "B"],
  startProbability: { A: 1, B: 0 },
  transitionProbability: { A: { A: 0, B: 0 }, B: { A: 0, B: 0 } },
  emissionProbability: { A: { x: 1 }, B: { x: 1 } },
  observations: ["x", "x"]
});
assert.equal(impossible.path, null);
assert.equal(impossible.probability, 0);
assert.equal(impossible.logProbability, -Infinity);

const tie = viterbi({
  states: ["A", "B"],
  startProbability: { A: 0.5, B: 0.5 },
  transitionProbability: {
    A: { A: 0.5, B: 0.5 },
    B: { A: 0.5, B: 0.5 }
  },
  emissionProbability: {
    A: { x: 0.5 },
    B: { x: 0.5 }
  },
  observations: ["x"]
});
assert.deepEqual(tie.path, ["A"]);

assert.throws(() => viterbi({
  states: ["A"],
  startProbability: { A: 1.2 },
  transitionProbability: {},
  emissionProbability: {},
  observations: ["x"]
}), RangeError);

console.log("Viterbi tests passed.");

module.exports = { viterbi };
