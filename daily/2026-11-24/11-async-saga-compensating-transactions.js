'use strict';

const assert = require('node:assert/strict');

async function runSaga(steps, initialContext = {}, signal) {
  const context = initialContext;
  const completed = [];
  const results = [];

  try {
    for (const step of steps) {
      if (signal?.aborted) throw signal.reason || new Error('Saga aborted');
      const result = await step.execute(context, signal);
      completed.push({ step, result });
      results.push({ name: step.name, result });
    }
    return { context, results };
  } catch (primaryError) {
    const compensationErrors = [];
    for (let i = completed.length - 1; i >= 0; i--) {
      const { step, result } = completed[i];
      if (typeof step.compensate !== 'function') continue;
      try {
        await step.compensate(context, result, primaryError);
      } catch (error) {
        compensationErrors.push(error);
      }
    }
    if (compensationErrors.length) {
      throw new AggregateError([primaryError, ...compensationErrors], 'Saga failed and compensation was incomplete', {
        cause: primaryError
      });
    }
    throw primaryError;
  }
}

(async () => {
  const events = [];
  const steps = [
    {
      name: 'reserve',
      execute: async context => { events.push('reserve'); context.reservation = 'R-17'; return 'R-17'; },
      compensate: async context => { events.push('release'); delete context.reservation; }
    },
    {
      name: 'charge',
      execute: async context => { events.push('charge'); context.payment = 500; return 500; },
      compensate: async context => { events.push('refund'); delete context.payment; }
    },
    {
      name: 'ship',
      execute: async () => { events.push('ship'); throw new Error('carrier unavailable'); }
    }
  ];

  await assert.rejects(runSaga(steps), /carrier unavailable/);
  assert.deepEqual(events, ['reserve', 'charge', 'ship', 'refund', 'release']);

  const successful = await runSaga([
    { name: 'a', execute: async ctx => { ctx.count = 1; return 1; } },
    { name: 'b', execute: async ctx => { ctx.count += 1; return ctx.count; } }
  ]);
  assert.equal(successful.context.count, 2);
  assert.deepEqual(successful.results.map(item => item.result), [1, 2]);

  const controller = new AbortController();
  controller.abort(new Error('cancelled'));
  await assert.rejects(runSaga([{ name: 'never', execute: async () => 1 }], {}, controller.signal), /cancelled/);
  console.log('Saga-compensation examples passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { runSaga };
