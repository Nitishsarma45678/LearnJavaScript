"use strict";

/**
 * Exercise: Implement a Koa-style asynchronous middleware composer.
 *
 * Middleware runs in an onion: code before await next() runs inward, and code
 * after it runs outward. Each request gets its own dispatch state. Calling
 * next() more than once is rejected, and errors propagate through the chain
 * unless an upstream middleware catches them.
 */

const assert = require("node:assert/strict");

function compose(middleware) {
  if (!Array.isArray(middleware)) {
    throw new TypeError("middleware must be an array");
  }

  const stack = middleware.slice();
  for (const [index, fn] of stack.entries()) {
    if (typeof fn !== "function") {
      throw new TypeError("middleware at index " + index + " must be a function");
    }
  }

  return async function run(context, terminal = async () => undefined) {
    if (typeof terminal !== "function") {
      throw new TypeError("terminal must be a function");
    }

    // This index belongs to one invocation, never to the shared composed app.
    let lastDispatched = -1;

    async function dispatch(index) {
      if (index <= lastDispatched) {
        throw new Error("next() called more than once");
      }
      lastDispatched = index;

      const current = stack[index];
      if (!current) return terminal(context);

      return current(context, () => dispatch(index + 1));
    }

    return dispatch(0);
  };
}

async function runTests() {
  const trace = [];
  const app = compose([
    async (context, next) => {
      trace.push("first:before");
      await next();
      trace.push("first:after");
    },
    async (context, next) => {
      trace.push("second:before");
      await next();
      trace.push("second:after");
    }
  ]);

  await app({ requestId: "one" }, async () => {
    trace.push("terminal");
  });
  assert.deepEqual(trace, [
    "first:before",
    "second:before",
    "terminal",
    "second:after",
    "first:after"
  ]);

  // A middleware may short-circuit the rest of the chain.
  const shortCircuit = compose([
    async context => {
      context.status = 204;
      return "no content";
    },
    async () => {
      throw new Error("must not execute");
    }
  ]);
  const shortContext = {};
  assert.equal(await shortCircuit(shortContext), "no content");
  assert.equal(shortContext.status, 204);

  // An upstream middleware can act as an error boundary.
  const errorBoundary = compose([
    async (context, next) => {
      try {
        await next();
      } catch (error) {
        context.handled = error.message;
      }
    },
    async () => {
      throw new Error("downstream failure");
    }
  ]);
  const errorContext = {};
  await errorBoundary(errorContext);
  assert.equal(errorContext.handled, "downstream failure");

  // A second next() call is rejected, including after the first has completed.
  const invalid = compose([
    async (context, next) => {
      await next();
      await next();
    }
  ]);
  await assert.rejects(
    invalid({}, async () => undefined),
    /next\(\) called more than once/
  );

  // Dispatch state is isolated across concurrent requests.
  const concurrentApp = compose([
    async (context, next) => {
      context.events.push("outer:start");
      await Promise.resolve();
      await next();
      context.events.push("outer:end");
    },
    async (context, next) => {
      context.events.push("inner:start:" + context.id);
      await next();
      context.events.push("inner:end:" + context.id);
    }
  ]);

  const contexts = [
    { id: "A", events: [] },
    { id: "B", events: [] }
  ];
  await Promise.all(contexts.map(context =>
    concurrentApp(context, async current => {
      current.events.push("terminal:" + current.id);
    })
  ));

  for (const context of contexts) {
    assert.deepEqual(context.events, [
      "outer:start",
      "inner:start:" + context.id,
      "terminal:" + context.id,
      "inner:end:" + context.id,
      "outer:end"
    ]);
  }

  // The terminal's return value is passed through the whole chain.
  const passThrough = compose([
    async (context, next) => ({ wrapped: await next() })
  ]);
  assert.deepEqual(await passThrough({}, async () => 42), { wrapped: 42 });

  assert.throws(() => compose([null]), TypeError);
  assert.throws(() => compose("not an array"), TypeError);
  console.log("Async middleware composer: all tests passed");
}

module.exports = { compose };

if (require.main === module) {
  runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
