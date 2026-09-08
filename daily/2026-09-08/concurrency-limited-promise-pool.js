/**
 * Concurrency-Limited Promise Pool
 *
 * Run async jobs while allowing at most `limit` jobs to execute at once.
 * The pool preserves result order, supports fail-fast mode, and avoids
 * starting new jobs after a failure when failFast is enabled.
 */

function createPromisePool(limit, { failFast = true } = {}) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("limit must be a positive integer");
  }

  return async function runPool(tasks) {
    if (!Array.isArray(tasks)) {
      throw new TypeError("tasks must be an array of functions");
    }

    const results = new Array(tasks.length);
    const errors = [];
    let nextIndex = 0;
    let active = 0;
    let stopped = false;

    return new Promise((resolve, reject) => {
      const finish = () => {
        if (active !== 0 && nextIndex < tasks.length) return;

        if (failFast && errors.length > 0) {
          reject(errors[0].error);
          return;
        }

        resolve({ results, errors });
      };

      const schedule = () => {
        if (stopped) {
          finish();
          return;
        }

        while (active < limit && nextIndex < tasks.length) {
          const index = nextIndex++;
          const task = tasks[index];
          active++;

          Promise.resolve()
            .then(() => {
              if (typeof task !== "function") {
                throw new TypeError(`Task ${index} is not a function`);
              }
              return task();
            })
            .then((value) => {
              results[index] = value;
            })
            .catch((error) => {
              errors.push({ index, error });
              if (failFast) stopped = true;
            })
            .finally(() => {
              active--;
              schedule();
            });
        }

        finish();
      };

      schedule();
    });
  };
}

// Example usage
const sleep = (ms, value) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const pool = createPromisePool(2);

pool([
  () => sleep(120, "A"),
  () => sleep(60, "B"),
  () => sleep(40, "C"),
  () => sleep(80, "D"),
]).then(({ results }) => {
  console.log(results); // ["A", "B", "C", "D"]
});

module.exports = { createPromisePool };
