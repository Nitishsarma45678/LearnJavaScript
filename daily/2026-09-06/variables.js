// Daily JavaScript practice — 2026-09-06
// Memoized recursive evaluator for a dependency graph.

const graph = {
  build: { deps: ["compile", "lint"], cost: 4 },
  compile: { deps: ["parse", "typecheck"], cost: 7 },
  lint: { deps: ["parse"], cost: 3 },
  parse: { deps: [], cost: 5 },
  typecheck: { deps: ["parse"], cost: 6 }
};

const memo = new Map();
const visiting = new Set();

function totalCost(task) {
  if (memo.has(task)) return memo.get(task);
  if (visiting.has(task)) throw new Error(`Dependency cycle detected at: ${task}`);

  const node = graph[task];
  if (!node) throw new Error(`Unknown task: ${task}`);

  visiting.add(task);
  const dependencyCost = node.deps.reduce((sum, dep) => sum + totalCost(dep), 0);
  visiting.delete(task);

  const result = node.cost + dependencyCost;
  memo.set(task, result);
  return result;
}

console.log("Build cost:", totalCost("build"));
console.log("Memoized tasks:", [...memo.keys()]);
