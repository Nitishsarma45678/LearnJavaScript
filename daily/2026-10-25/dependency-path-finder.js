/**
 * Find the shortest dependency path in an unweighted directed graph using BFS.
 * Returns null when the destination cannot be reached.
 */
function shortestPath(graph, start, target) {
  if (start === target) return [start];
  const queue = [start];
  let head = 0;
  const previous = new Map([[start, null]]);

  while (head < queue.length) {
    const node = queue[head++];
    for (const neighbor of graph.get(node) ?? []) {
      if (previous.has(neighbor)) continue;
      previous.set(neighbor, node);
      if (neighbor === target) {
        const path = [target];
        let cursor = target;
        while (previous.get(cursor) !== null) {
          cursor = previous.get(cursor);
          path.push(cursor);
        }
        return path.reverse();
      }
      queue.push(neighbor);
    }
  }
  return null;
}

const dependencies = new Map([
  ["app", ["auth", "cache"]],
  ["auth", ["db"]],
  ["cache", ["db"]],
  ["db", []],
]);
console.assert(JSON.stringify(shortestPath(dependencies, "app", "db")) === '["app","auth","db"]');
console.assert(shortestPath(dependencies, "db", "app") === null);
console.log("dependency path finder practice passed");
