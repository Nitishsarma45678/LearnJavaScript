// Practice: memoized DFS for counting paths in a directed acyclic graph.

function countPaths(graph, start, target) {
  const memo = new Map();
  const visiting = new Set();

  function dfs(node) {
    if (node === target) return 1;
    if (memo.has(node)) return memo.get(node);
    if (visiting.has(node)) {
      throw new Error(`Cycle detected at ${node}`);
    }

    visiting.add(node);
    let total = 0;

    for (const next of graph.get(node) ?? []) {
      total += dfs(next);
    }

    visiting.delete(node);
    memo.set(node, total);
    return total;
  }

  return dfs(start);
}

const graph = new Map([
  ["A", ["B", "C"]],
  ["B", ["D", "E"]],
  ["C", ["E"]],
  ["D", ["F"]],
  ["E", ["F"]],
  ["F", []],
]);

console.log(countPaths(graph, "A", "F")); // 3
