/**
 * Compare two object graphs and report added, removed, and changed values.
 * Paths are arrays of keys. Cyclic pairs are visited only once.
 * Arrays are compared by index; primitives use Object.is semantics.
 */
function deepDiff(before, after) {
  const changes = [];
  const visitedPairs = new WeakMap();

  function wasVisited(left, right) {
    if ((typeof left !== "object" || left === null) ||
        (typeof right !== "object" || right === null)) return false;
    let rights = visitedPairs.get(left);
    if (!rights) visitedPairs.set(left, rights = new WeakSet());
    if (rights.has(right)) return true;
    rights.add(right);
    return false;
  }

  function walk(left, right, path) {
    if (Object.is(left, right)) return;
    const leftObject = left !== null && typeof left === "object";
    const rightObject = right !== null && typeof right === "object";
    if (!leftObject || !rightObject || Array.isArray(left) !== Array.isArray(right)) {
      changes.push({ type: "changed", path, before: left, after: right });
      return;
    }
    if (wasVisited(left, right)) return;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    const leftSet = new Set(leftKeys);
    const rightSet = new Set(rightKeys);

    for (const key of leftKeys) {
      if (!rightSet.has(key)) {
        changes.push({ type: "removed", path: [...path, key], before: left[key] });
      } else {
        walk(left[key], right[key], [...path, key]);
      }
    }
    for (const key of rightKeys) {
      if (!leftSet.has(key)) {
        changes.push({ type: "added", path: [...path, key], after: right[key] });
      }
    }
  }

  walk(before, after, []);
  return changes;
}

const result = deepDiff(
  { user: { name: "Ada", role: "reader" }, tags: ["js"], obsolete: true },
  { user: { name: "Ada", role: "admin" }, tags: ["js", "algorithms"], active: true }
);
console.assert(result.some(change => change.type === "changed" && change.path.join(".") === "user.role"));
console.assert(result.some(change => change.type === "removed" && change.path[0] === "obsolete"));
console.assert(result.some(change => change.type === "added" && change.path.join(".") === "active"));

const left = {}; left.self = left;
const right = {}; right.self = right;
console.assert(deepDiff(left, right).length === 0);
console.log("deep object diff practice passed");
