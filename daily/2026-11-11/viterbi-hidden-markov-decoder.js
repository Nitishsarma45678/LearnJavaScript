'use strict';

/**
 * Exercise: implement Viterbi decoding and forward-backward inference for an HMM.
 *
 * Model tables contain log probabilities:
 * { states, startLogProb, transitionLogProb, emissionLogProb }.
 * Missing transitions/emissions mean impossible (-Infinity). Ties follow the
 * order of model.states. Probability products are never formed directly.
 */

function ownValue(object, key) {
  return object && Object.prototype.hasOwnProperty.call(object, key)
    ? object[key] : undefined;
}

function logProbability(value, label) {
  if (value === undefined) return -Infinity;
  if (typeof value !== 'number' || Number.isNaN(value) ||
      value === Infinity || value > 0) {
    throw new TypeError(label + ' must be a log probability <= 0 or -Infinity');
  }
  return value;
}

function logSumExp(values) {
  let maximum = -Infinity;
  for (const value of values) maximum = Math.max(maximum, value);
  if (maximum === -Infinity) return -Infinity;
  let sum = 0;
  for (const value of values) sum += Math.exp(value - maximum);
  return maximum + Math.log(sum);
}

function validateModel(model) {
  if (!model || !Array.isArray(model.states) || model.states.length === 0) {
    throw new TypeError('model.states must be a non-empty array');
  }
  const states = model.states.slice();
  if (states.some(state => typeof state !== 'string' || state.length === 0) ||
      new Set(states).size !== states.length) {
    throw new TypeError('states must be unique non-empty strings');
  }
  return states;
}

function startScore(model, state) {
  return logProbability(ownValue(model.startLogProb, state), 'startLogProb[' + state + ']');
}
function transitionScore(model, from, to) {
  return logProbability(ownValue(ownValue(model.transitionLogProb, from), to),
    'transitionLogProb[' + from + '][' + to + ']');
}
function emissionScore(model, state, observation) {
  return logProbability(ownValue(ownValue(model.emissionLogProb, state), observation),
    'emissionLogProb[' + state + '][' + observation + ']');
}

function forwardTable(model, observations, states) {
  const table = [];
  if (observations.length === 0) return table;
  table.push(states.map(state =>
    startScore(model, state) + emissionScore(model, state, observations[0])
  ));

  for (let time = 1; time < observations.length; time += 1) {
    const previous = table[time - 1];
    table.push(states.map(toState => {
      const candidates = states.map((fromState, index) =>
        previous[index] + transitionScore(model, fromState, toState)
      );
      return logSumExp(candidates) + emissionScore(model, toState, observations[time]);
    }));
  }
  return table;
}

function forwardLogLikelihood(model, observations) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const states = validateModel(model);
  if (observations.length === 0) return 0;
  const table = forwardTable(model, observations, states);
  return logSumExp(table[table.length - 1]);
}

function viterbiDecode(model, observations) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const states = validateModel(model);
  if (observations.length === 0) return { path: [], logProbability: 0 };

  let scores = states.map(state =>
    startScore(model, state) + emissionScore(model, state, observations[0])
  );
  const backpointers = [];

  for (let time = 1; time < observations.length; time += 1) {
    const nextScores = new Array(states.length).fill(-Infinity);
    const previousState = new Array(states.length).fill(-1);

    for (let to = 0; to < states.length; to += 1) {
      let best = -Infinity;
      let bestFrom = -1;
      for (let from = 0; from < states.length; from += 1) {
        const candidate = scores[from] + transitionScore(model, states[from], states[to]);
        if (candidate > best) {
          best = candidate;
          bestFrom = from;
        }
      }
      nextScores[to] = best + emissionScore(model, states[to], observations[time]);
      previousState[to] = bestFrom;
    }
    scores = nextScores;
    backpointers.push(previousState);
  }

  let bestFinal = -Infinity;
  let finalIndex = -1;
  for (let index = 0; index < scores.length; index += 1) {
    if (scores[index] > bestFinal) {
      bestFinal = scores[index];
      finalIndex = index;
    }
  }
  if (finalIndex === -1 || bestFinal === -Infinity) {
    return { path: null, logProbability: -Infinity };
  }

  const path = new Array(observations.length);
  let index = finalIndex;
  path[path.length - 1] = states[index];
  for (let time = observations.length - 2; time >= 0; time -= 1) {
    index = backpointers[time][index];
    if (index < 0) return { path: null, logProbability: -Infinity };
    path[time] = states[index];
  }
  return { path, logProbability: bestFinal };
}

function forwardBackward(model, observations) {
  if (!Array.isArray(observations)) throw new TypeError('observations must be an array');
  const states = validateModel(model);
  if (observations.length === 0) return { logLikelihood: 0, posterior: [] };

  const forward = forwardTable(model, observations, states);
  const logLikelihood = logSumExp(forward[forward.length - 1]);
  if (logLikelihood === -Infinity) return { logLikelihood, posterior: null };

  const backward = new Array(observations.length);
  backward[observations.length - 1] = states.map(() => 0);
  for (let time = observations.length - 2; time >= 0; time -= 1) {
    backward[time] = states.map(fromState => {
      const candidates = states.map((toState, index) =>
        transitionScore(model, fromState, toState) +
        emissionScore(model, toState, observations[time + 1]) +
        backward[time + 1][index]
      );
      return logSumExp(candidates);
    });
  }

  const posterior = forward.map((row, time) => {
    const weights = row.map((value, index) =>
      Math.exp(value + backward[time][index] - logLikelihood)
    );
    return states.map((state, index) => ({ state, probability: weights[index] }));
  });
  return { logLikelihood, posterior };
}

function runTests() {
  const assert = require('node:assert/strict');
  const log = Math.log;
  const model = {
    states: ['Rainy', 'Sunny'],
    startLogProb: { Rainy: log(0.6), Sunny: log(0.4) },
    transitionLogProb: {
      Rainy: { Rainy: log(0.7), Sunny: log(0.3) },
      Sunny: { Rainy: log(0.4), Sunny: log(0.6) }
    },
    emissionLogProb: {
      Rainy: { walk: log(0.1), shop: log(0.4), clean: log(0.5) },
      Sunny: { walk: log(0.6), shop: log(0.3), clean: log(0.1) }
    }
  };

  const observations = ['walk', 'shop', 'clean'];
  const decoded = viterbiDecode(model, observations);
  assert.equal(decoded.path.length, observations.length);
  assert.ok(decoded.logProbability <= 0);
  const inference = forwardBackward(model, observations);
  assert.ok(Math.abs(inference.logLikelihood -
    forwardLogLikelihood(model, observations)) < 1e-12);
  for (const row of inference.posterior) {
    assert.ok(Math.abs(row.reduce((sum, item) => sum + item.probability, 0) - 1) < 1e-10);
  }
  assert.deepEqual(viterbiDecode(model, []), { path: [], logProbability: 0 });
  assert.equal(forwardLogLikelihood(model, []), 0);

  const impossible = {
    states: ['A', 'B'],
    startLogProb: { A: 0, B: -Infinity },
    transitionLogProb: { A: { A: -Infinity, B: -Infinity } },
    emissionLogProb: { A: { x: 0 }, B: { x: 0 } }
  };
  assert.deepEqual(viterbiDecode(impossible, ['x', 'x']),
    { path: null, logProbability: -Infinity });
  assert.equal(forwardBackward(impossible, ['x', 'x']).posterior, null);
  assert.throws(() => forwardLogLikelihood(model, 'walk'), /array/);
  assert.throws(() => viterbiDecode({ states: ['A', 'A'] }, ['x']), /unique/);

  // Compare dynamic programming with exhaustive enumeration on small HMMs.
  let seed = 0x13579bdf;
  const random = limit => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  };
  const randomDistribution = count => {
    const raw = Array.from({ length: count }, () => 1 + random(100));
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map(value => Math.log(value / total));
  };

  let trials = 0;
  for (let trial = 0; trial < 80; trial += 1) {
    const states = ['S0', 'S1', 'S2'];
    const start = randomDistribution(3);
    const transition = {};
    const emission = {};
    for (const state of states) {
      const row = randomDistribution(3);
      transition[state] = Object.fromEntries(states.map((to, i) => [to, row[i]]));
      const emitted = randomDistribution(2);
      emission[state] = { obs0: emitted[0], obs1: emitted[1] };
    }
    const randomized = {
      states,
      startLogProb: Object.fromEntries(states.map((state, i) => [state, start[i]])),
      transitionLogProb: transition,
      emissionLogProb: emission
    };
    const sequence = Array.from({ length: 4 }, () => random(2) ? 'obs1' : 'obs0');
    const scores = [];

    function enumerate(prefix, score, time) {
      if (time === sequence.length) {
        scores.push(score);
        return;
      }
      for (const state of states) {
        const next = time === 0
          ? startScore(randomized, state) + emissionScore(randomized, state, sequence[time])
          : score + transitionScore(randomized, prefix[prefix.length - 1], state) +
            emissionScore(randomized, state, sequence[time]);
        enumerate(prefix.concat(state), next, time + 1);
      }
    }
    enumerate([], 0, 0);

    const expectedBest = Math.max(...scores);
    const expectedTotal = logSumExp(scores);
    assert.ok(Math.abs(viterbiDecode(randomized, sequence).logProbability -
      expectedBest) < 1e-10);
    assert.ok(Math.abs(forwardLogLikelihood(randomized, sequence) -
      expectedTotal) < 1e-10);
    trials += 1;
  }

  return { checks: 13 + trials, randomizedTrials: trials };
}

if (typeof module !== 'undefined') {
  module.exports = { viterbiDecode, forwardLogLikelihood, forwardBackward, logSumExp, runTests };
}
