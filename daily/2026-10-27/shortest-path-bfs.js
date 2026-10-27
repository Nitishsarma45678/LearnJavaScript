// Exercise: Return the shortest unweighted path between two vertices.
// The graph is a Map whose keys are vertices and whose values are neighbor arrays.
// Return null when no path exists. Vertex identity follows JavaScript Set/Map rules.

"use strict";

function shortestPath(graph, start, target) {
  if (!(graph instanceof Map)) throw new TypeError("graph must be a Map");
  if (start === target) return [start];
  if (!graph.has(start) || !graph.has(target)) return null;

  const queue = [start];
  let head = 0;
  const visited = new Set([start]);
  const parent = new Map();

  while (head < queue.length) {
    const current = queue[head++];
    const neighbors = graph.get(current) || [];

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parent.set(neighbor, current);

      if (neighbor === target) {
        const path = [target];
        let cursor = target;
        while (cursor !== start) {
          cursor = parent.get(cursor);
          path.push(cursor);
        }
        path.reverse();
        return path;
      }

      queue.push(neighbor);
    }
  }

  return null;
}

module.exports = { shortestPath };

if (require.main === module) {
  const assert = require("node:assert/strict");
  const graph = new Map([
    ["A", ["B", "C"]],
    ["B", ["A", "D", "E"]],
    ["C", ["A", "F"]],
    ["D", ["B", "G"]],
    ["E", ["B", "G"]],
    ["F", ["C", "G"]],
    ["G", ["D", "E", "F"]],
    ["ISOLATED", []]
  ]);

  assert.deepEqual(shortestPath(graph, "A", "G"), ["A", "B", "D", "G"]);
  assert.deepEqual(shortestPath(graph, "C", "C"), ["C"]);
  assert.equal(shortestPath(graph, "A", "ISOLATED"), null);
  assert.equal(shortestPath(graph, "missing", "G"), null);
  assert.throws(() => shortestPath({}, "A", "B"), TypeError);
  console.log("shortest-path-bfs: all tests passed");
}
