// JavaScript Practice — 2026-09-10
// Topic: Closures, recursion, memoization, and non-trivial object/array algorithms.

// Goal:
// Count the number of valid paths through a grid while moving only right/down.
// The solution uses a closure to keep a private memoization cache and recursion
// to break the problem into smaller overlapping subproblems.

function createPathCounter(blockedCells = []) {
  const blocked = new Set(blockedCells.map(([row, col]) => `${row},${col}`));
  const memo = new Map();

  function countPaths(row, col, rows, cols) {
    if (row >= rows || col >= cols) return 0;
    if (blocked.has(`${row},${col}`)) return 0;
    if (row === rows - 1 && col === cols - 1) return 1;

    const key = `${row},${col}`;
    if (memo.has(key)) return memo.get(key);

    const pathsFromHere =
      countPaths(row + 1, col, rows, cols) +
      countPaths(row, col + 1, rows, cols);

    memo.set(key, pathsFromHere);
    return pathsFromHere;
  }

  return function count(rows, cols) {
    if (!Number.isInteger(rows) || !Number.isInteger(cols)) {
      throw new TypeError("rows and cols must be integers");
    }
    if (rows <= 0 || cols <= 0) return 0;

    memo.clear();
    return countPaths(0, 0, rows, cols);
  };
}

// Higher-order helper: build a counter with a blocked-cell rule.
function createScenario(name, blockedCells) {
  const countPaths = createPathCounter(blockedCells);

  return {
    name,
    blockedCells,
    solve(rows, cols) {
      return countPaths(rows, cols);
    },
  };
}

// A more general recursive algorithm: enumerate every valid path.
function enumeratePaths(rows, cols, blockedCells = []) {
  const blocked = new Set(blockedCells.map(([row, col]) => `${row},${col}`));
  const paths = [];

  function walk(row, col, path) {
    if (row >= rows || col >= cols) return;
    if (blocked.has(`${row},${col}`)) return;

    const nextPath = [...path, [row, col]];

    if (row === rows - 1 && col === cols - 1) {
      paths.push(nextPath);
      return;
    }

    walk(row + 1, col, nextPath);
    walk(row, col + 1, nextPath);
  }

  if (rows > 0 && cols > 0) walk(0, 0, []);
  return paths;
}

// Example usage.
const openGrid = createScenario("Open 4x4 grid", []);
const blockedGrid = createScenario("4x4 grid with obstacles", [
  [1, 1],
  [2, 2],
]);

console.log(openGrid.name, "=>", openGrid.solve(4, 4));
console.log(blockedGrid.name, "=>", blockedGrid.solve(4, 4));

const paths = enumeratePaths(3, 3, [[1, 1]]);
console.log("Valid 3x3 paths with center blocked:", paths.length);
console.log("First path:", paths[0]);

// Challenge extensions:
// 1. Add diagonal movement without double-counting paths.
// 2. Return the shortest valid path, not just the number of paths.
// 3. Make the memoization cache expose statistics without exposing its Map.
// 4. Rewrite the counter iteratively and compare its complexity with recursion.
