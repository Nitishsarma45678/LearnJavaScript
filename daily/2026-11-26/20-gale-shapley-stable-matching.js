'use strict';

// Exercise: compute a stable one-to-one matching using the deferred acceptance
// algorithm. Preference lists are strict, complete permutations of 0..n-1.

const assert = require('node:assert/strict');

function validatePreferences(preferences, n, label) {
  if (!Array.isArray(preferences) || preferences.length !== n) {
    throw new TypeError(label + ' preferences must contain n lists');
  }
  for (const list of preferences) {
    if (!Array.isArray(list) || list.length !== n ||
        new Set(list).size !== n ||
        list.some((id) => !Number.isInteger(id) || id < 0 || id >= n)) {
      throw new TypeError(label + ' lists must be complete permutations');
    }
  }
}

function stableMatching(firstSide, secondSide) {
  if (!Array.isArray(firstSide) || !Array.isArray(secondSide) ||
      firstSide.length !== secondSide.length) {
    throw new TypeError('both sides must contain the same number of participants');
  }
  const n = firstSide.length;
  validatePreferences(firstSide, n, 'first-side');
  validatePreferences(secondSide, n, 'second-side');

  const rank = secondSide.map((preferences) => {
    const positions = Array(n);
    preferences.forEach((participant, index) => { positions[participant] = index; });
    return positions;
  });
  const partner = Array(n).fill(-1);
  const nextChoice = Array(n).fill(0);
  const free = Array.from({ length: n }, (_, i) => i);

  while (free.length) {
    const proposer = free.shift();
    if (nextChoice[proposer] >= n) throw new Error('complete preferences must admit a matching');
    const receiver = firstSide[proposer][nextChoice[proposer]++];
    const incumbent = partner[receiver];

    if (incumbent === -1) {
      partner[receiver] = proposer;
    } else if (rank[receiver][proposer] < rank[receiver][incumbent]) {
      partner[receiver] = proposer;
      free.push(incumbent);
    } else {
      free.push(proposer);
    }
  }

  const receiverOf = Array(n).fill(-1);
  partner.forEach((proposer, receiver) => { receiverOf[proposer] = receiver; });
  return {
    pairs: receiverOf.map((receiver, proposer) => [proposer, receiver]),
    receiverOf,
    proposerOf: partner
  };
}

function isStable(firstSide, secondSide, matching) {
  const { receiverOf, proposerOf } = matching;
  const rank = secondSide.map((preferences) => {
    const positions = Array(preferences.length);
    preferences.forEach((id, i) => { positions[id] = i; });
    return positions;
  });
  for (let proposer = 0; proposer < firstSide.length; proposer += 1) {
    for (const receiver of firstSide[proposer]) {
      if (receiver === receiverOf[proposer]) break;
      const incumbent = proposerOf[receiver];
      if (rank[receiver][proposer] < rank[receiver][incumbent]) return false;
    }
  }
  return true;
}

const men = [[0, 1], [0, 1]];
const women = [[1, 0], [0, 1]];
const result = stableMatching(men, women);
assert.deepEqual(result.pairs, [[0, 1], [1, 0]]);
assert.equal(isStable(men, women, result), true);
assert.equal(isStable([[0, 1], [0, 1]], [[0, 1], [1, 0]], {
  receiverOf: [1, 0], proposerOf: [1, 0]
}), false);
assert.throws(() => stableMatching([[0, 0]], [[0]]), TypeError);
assert.deepEqual(stableMatching([], []).pairs, []);

module.exports = { stableMatching, isStable };
