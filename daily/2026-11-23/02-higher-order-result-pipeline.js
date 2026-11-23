// Exercise: Implement a composable pipeline that carries failures as data.
// A step may return a plain value, return ok(value)/err(error), or throw.
// Once a failure occurs, later steps must not execute.
//
// Run: node 02-higher-order-result-pipeline.js
const assert = require("node:assert/strict");

const ok = (value) => Object.freeze({ ok: true, value });
const err = (error) => Object.freeze({
  ok: false,
  error: error instanceof Error ? error : new Error(String(error))
});
const isResult = (value) => value !== null && typeof value === "object" &&
  typeof value.ok === "boolean" && (value.ok ? "value" in value : "error" in value);

function mapResult(result, mapper) {
  if (!isResult(result)) throw new TypeError("mapResult expects a Result");
  if (!result.ok) return result;
  try {
    const mapped = mapper(result.value);
    return isResult(mapped) ? mapped : ok(mapped);
  } catch (error) {
    return err(error);
  }
}

function flatMapResult(result, mapper) {
  if (!isResult(result)) throw new TypeError("flatMapResult expects a Result");
  if (!result.ok) return result;
  try {
    const mapped = mapper(result.value);
    if (!isResult(mapped)) throw new TypeError("flatMap callback must return a Result");
    return mapped;
  } catch (error) {
    return err(error);
  }
}

function composeResult(...steps) {
  if (steps.some((step) => typeof step !== "function")) {
    throw new TypeError("every pipeline step must be a function");
  }

  return function runPipeline(input, ...rest) {
    if (steps.length === 0) return ok(input);
    let current;

    try {
      current = steps[0](input, ...rest);
    } catch (error) {
      return err(error);
    }
    if (!isResult(current)) current = ok(current);

    for (let index = 1; index < steps.length; index += 1) {
      if (!current.ok) return current;
      try {
        current = steps[index](current.value);
        if (!isResult(current)) current = ok(current);
      } catch (error) {
        return err(error);
      }
    }
    return current;
  };
}

function tapResult(result, effect) {
  return mapResult(result, (value) => {
    effect(value);
    return value;
  });
}

function recoverResult(result, fallback) {
  if (!isResult(result)) throw new TypeError("recoverResult expects a Result");
  if (result.ok) return result;
  try {
    const value = fallback(result.error);
    return isResult(value) ? value : ok(value);
  } catch (error) {
    return err(error);
  }
}

// Example tests
{
  const parseInteger = (text) => {
    if (!/^-?\d+$/.test(text)) return err("not an integer");
    return ok(Number(text));
  };
  const requirePositive = (number) => number > 0 ? ok(number) : err("must be positive");
  const reciprocal = (number) => 1 / number;
  const pipeline = composeResult(parseInteger, requirePositive, reciprocal);

  assert.deepEqual(pipeline("4"), ok(0.25));
  assert.equal(pipeline("0").ok, false);
  assert.equal(pipeline("hello").error.message, "not an integer");

  let executed = false;
  const stopped = composeResult(
    () => err("stop"),
    () => { executed = true; return 1; }
  )();
  assert.equal(stopped.error.message, "stop");
  assert.equal(executed, false);

  const recovered = recoverResult(err("offline"), () => "cached");
  assert.deepEqual(recovered, ok("cached"));
  assert.deepEqual(mapResult(ok(3), (n) => n * 2), ok(6));
  assert.deepEqual(flatMapResult(ok(3), (n) => ok(n + 1)), ok(4));
  assert.equal(tapResult(ok(5), () => {}).value, 5);
}
console.log("Result pipeline tests passed");
