'use strict';

/**
 * Minimize a complete deterministic finite automaton with Hopcroft's algorithm.
 * Unreachable states are discarded. State and alphabet symbols are strings.
 *
 * Input:
 * {
 *   states: ['even', 'odd'], alphabet: ['0', '1'], start: 'even',
 *   accepting: ['even'],
 *   transitions: { even: { '0': 'even', '1': 'odd' }, ... }
 * }
 *
 * Returns a minimized DFA whose states are named M0, M1, ... and whose
 * groups field records the original states represented by each new state.
 */
function minimizeDFA(input) {
  const { states, alphabet, start, accepting, transitions } = input;
  if (!Array.isArray(states) || states.length === 0) throw new TypeError('states must be a non-empty array');
  if (!Array.isArray(alphabet) || !Array.isArray(accepting)) throw new TypeError('alphabet and accepting must be arrays');

  const uniqueStates = new Set(states);
  const uniqueAlphabet = new Set(alphabet);
  if (uniqueStates.size !== states.length || states.some(s => typeof s !== 'string')) {
    throw new TypeError('states must contain unique strings');
  }
  if (uniqueAlphabet.size !== alphabet.length || alphabet.some(a => typeof a !== 'string')) {
    throw new TypeError('alphabet must contain unique strings');
  }
  if (!uniqueStates.has(start)) throw new Error('start state is not declared');

  const acceptingSet = new Set(accepting);
  for (const state of acceptingSet) {
    if (!uniqueStates.has(state)) throw new Error('unknown accepting state: ' + state);
  }
  for (const state of states) {
    for (const symbol of alphabet) {
      const target = transitions?.[state]?.[symbol];
      if (!uniqueStates.has(target)) {
        throw new Error('missing or invalid transition from ' + state + ' on ' + symbol);
      }
    }
  }

  // Only reachable states can affect the recognized language.
  const reachable = [];
  const seen = new Set([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head];
    reachable.push(state);
    for (const symbol of alphabet) {
      const target = transitions[state][symbol];
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }

  const finalStates = reachable.filter(state => acceptingSet.has(state));
  const nonFinalStates = reachable.filter(state => !acceptingSet.has(state));
  let partitions = [finalStates, nonFinalStates].filter(block => block.length > 0);
  const worklist = [];
  if (partitions.length === 2) {
    worklist.push(partitions[0].length <= partitions[1].length ? partitions[0] : partitions[1]);
  } else {
    worklist.push(partitions[0]);
  }

  while (worklist.length > 0) {
    const splitter = worklist.pop();
    const splitterSet = new Set(splitter);

    for (const symbol of alphabet) {
      const predecessors = new Set();
      for (const state of reachable) {
        if (splitterSet.has(transitions[state][symbol])) predecessors.add(state);
      }

      // Iterate over a snapshot because a block can be replaced while splitting.
      for (const block of [...partitions]) {
        const inside = block.filter(state => predecessors.has(state));
        if (inside.length === 0 || inside.length === block.length) continue;
        const outside = block.filter(state => !predecessors.has(state));
        const index = partitions.indexOf(block);
        partitions.splice(index, 1, inside, outside);

        const queuedIndex = worklist.indexOf(block);
        if (queuedIndex !== -1) {
          worklist.splice(queuedIndex, 1, inside, outside);
        } else {
          worklist.push(inside.length <= outside.length ? inside : outside);
        }
      }
    }
  }

  // Stable output ordering: the start block is first, then by original input order.
  const inputOrder = new Map(states.map((state, index) => [state, index]));
  partitions.sort((a, b) => {
    const aHasStart = a.includes(start);
    const bHasStart = b.includes(start);
    if (aHasStart !== bHasStart) return aHasStart ? -1 : 1;
    return Math.min(...a.map(s => inputOrder.get(s))) - Math.min(...b.map(s => inputOrder.get(s)));
  });

  const blockOf = new Map();
  partitions.forEach((block, index) => block.forEach(state => blockOf.set(state, index)));
  const minimizedTransitions = {};
  const minimizedAccepting = [];
  partitions.forEach((block, index) => {
    const name = 'M' + index;
    const representative = block[0];
    minimizedTransitions[name] = {};
    if (acceptingSet.has(representative)) minimizedAccepting.push(name);
    for (const symbol of alphabet) {
      minimizedTransitions[name][symbol] = 'M' + blockOf.get(transitions[representative][symbol]);
    }
  });

  return {
    states: partitions.map((_, index) => 'M' + index),
    alphabet: [...alphabet],
    start: 'M' + blockOf.get(start),
    accepting: minimizedAccepting,
    transitions: minimizedTransitions,
    groups: partitions.map(block => [...block])
  };
}

if (require.main === module) {
  const assert = require('node:assert/strict');
  const parity = minimizeDFA({
    states: ['even', 'odd', 'unreachable'],
    alphabet: ['0', '1'],
    start: 'even',
    accepting: ['even'],
    transitions: {
      even: { '0': 'even', '1': 'odd' },
      odd: { '0': 'odd', '1': 'even' },
      unreachable: { '0': 'unreachable', '1': 'unreachable' }
    }
  });
  assert.equal(parity.states.length, 2);
  assert.equal(parity.groups.flat().includes('unreachable'), false);
  const evenBlock = parity.groups.findIndex(group => group.includes('even'));
  const oddBlock = parity.groups.findIndex(group => group.includes('odd'));
  assert.notEqual(evenBlock, oddBlock);
  assert.equal(parity.transitions['M' + evenBlock]['1'], 'M' + oddBlock);

  const universal = minimizeDFA({
    states: ['a', 'b'], alphabet: ['x'], start: 'a', accepting: ['a', 'b'],
    transitions: { a: { x: 'b' }, b: { x: 'a' } }
  });
  assert.equal(universal.states.length, 1);
  assert.deepEqual(universal.accepting, ['M0']);
  assert.throws(() => minimizeDFA({
    states: ['a'], alphabet: ['x'], start: 'a', accepting: [], transitions: { a: {} }
  }), /missing or invalid transition/);
  console.log('Hopcroft DFA minimizer: all tests passed');
}

module.exports = { minimizeDFA };
