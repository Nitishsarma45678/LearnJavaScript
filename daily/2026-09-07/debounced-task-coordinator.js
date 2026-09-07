// Daily JavaScript practice — 2026-09-07
// Debounced task coordinator with cancellation and latest-call semantics.

function createTaskCoordinator(task, delay = 150) {
  let timer = null;
  let generation = 0;

  return function schedule(...args) {
    const currentGeneration = ++generation;

    if (timer) clearTimeout(timer);

    return new Promise((resolve, reject) => {
      timer = setTimeout(async () => {
        timer = null;

        if (currentGeneration !== generation) return;

        try {
          const result = await task(...args);
          if (currentGeneration === generation) resolve(result);
        } catch (error) {
          if (currentGeneration === generation) reject(error);
        }
      }, delay);
    });
  };
}

const searchUsers = createTaskCoordinator(async query => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return [`Result for: ${query}`];
});

searchUsers("ni").catch(() => {});
searchUsers("nit").catch(() => {});
searchUsers("nitish").then(console.log);
