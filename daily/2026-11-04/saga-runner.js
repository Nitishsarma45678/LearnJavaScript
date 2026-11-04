'use strict';

const assert = require('node:assert/strict');

class SagaExecutionError extends Error {
  constructor(cause, rollbackErrors, completedSteps) {
    super('Saga failed; completed steps were compensated where possible', { cause });
    this.name = 'SagaExecutionError';
    this.rollbackErrors = rollbackErrors;
    this.completedSteps = completedSteps;
  }
}

function abortReason(signal) {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('Saga aborted');
  error.name = 'AbortError';
  return error;
}

async function runSaga(steps, context = {}, { signal } = {}) {
  if (!Array.isArray(steps)) throw new TypeError('steps must be an array');
  if (signal && typeof signal.aborted !== 'boolean') throw new TypeError('Invalid AbortSignal');

  for (const step of steps) {
    if (!step || typeof step.execute !== 'function') {
      throw new TypeError('Every step must provide an execute function');
    }
    if (step.compensate !== undefined && typeof step.compensate !== 'function') {
      throw new TypeError('compensate must be a function when provided');
    }
  }

  const completed = [];
  try {
    for (const step of steps) {
      if (signal?.aborted) throw abortReason(signal);
      const result = await step.execute(context);
      completed.push({ step, result });
    }
    if (signal?.aborted) throw abortReason(signal);
    return {
      context,
      results: completed.map(({ result }) => result)
    };
  } catch (cause) {
    const rollbackErrors = [];
    for (let index = completed.length - 1; index >= 0; index--) {
      const { step, result } = completed[index];
      if (!step.compensate) continue;
      try {
        await step.compensate(result, context, cause);
      } catch (error) {
        rollbackErrors.push({
          step: step.name ?? String(index),
          error
        });
      }
    }
    throw new SagaExecutionError(
      cause,
      rollbackErrors,
      completed.map(({ step }) => step.name ?? '(unnamed)')
    );
  }
}

if (require.main === module) {
  (async () => {
    const events = [];
    const success = await runSaga([
      {
        name: 'reserve',
        execute: async () => { events.push('reserve'); return 'reservation-1'; },
        compensate: async id => { events.push(`cancel:${id}`); }
      },
      {
        name: 'charge',
        execute: async () => { events.push('charge'); return 250; },
        compensate: async amount => { events.push(`refund:${amount}`); }
      }
    ]);
    assert.deepEqual(success.results, ['reservation-1', 250]);
    assert.deepEqual(events, ['reserve', 'charge']);

    const rollbackOrder = [];
    await assert.rejects(
      () => runSaga([
        {
          name: 'first',
          execute: async () => 'A',
          compensate: async () => { rollbackOrder.push('undo-first'); }
        },
        {
          name: 'second',
          execute: async () => 'B',
          compensate: async () => {
            rollbackOrder.push('undo-second');
            throw new Error('refund service unavailable');
          }
        },
        {
          name: 'third',
          execute: async () => { throw new Error('payment rejected'); }
        }
      ]),
      error => {
        assert.equal(error.name, 'SagaExecutionError');
        assert.match(error.cause.message, /payment rejected/);
        assert.equal(error.rollbackErrors.length, 1);
        assert.deepEqual(error.completedSteps, ['first', 'second']);
        return true;
      }
    );
    assert.deepEqual(rollbackOrder, ['undo-second', 'undo-first']);

    const controller = new AbortController();
    const abortedOrder = [];
    await assert.rejects(
      () => runSaga([
        {
          name: 'prepare',
          execute: async () => 'ready',
          compensate: async () => { abortedOrder.push('undo-prepare'); }
        },
        {
          name: 'cancel-run',
          execute: async () => {
            controller.abort();
            return 'finished-before-abort-check';
          },
          compensate: async () => { abortedOrder.push('undo-cancel-run'); }
        },
        { name: 'never-runs', execute: async () => 'unexpected' }
      ], {}, { signal: controller.signal }),
      error => error.cause.name === 'AbortError'
    );
    assert.deepEqual(abortedOrder, ['undo-cancel-run', 'undo-prepare']);
    console.log('Saga runner tests passed');
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { runSaga, SagaExecutionError };
