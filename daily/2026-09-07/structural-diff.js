// Structural object diff using recursion and path tracking.

function diffObjects(left, right, path = []) {
  const changes = [];
  const keys = new Set([...Reflect.ownKeys(left), ...Reflect.ownKeys(right)]);

  for (const key of keys) {
    const nextPath = [...path, key];
    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);

    if (!hasLeft) {
      changes.push({ type: "added", path: nextPath, value: right[key] });
      continue;
    }
    if (!hasRight) {
      changes.push({ type: "removed", path: nextPath, value: left[key] });
      continue;
    }

    const a = left[key];
    const b = right[key];
    const bothObjects = a && b && typeof a === "object" && typeof b === "object";

    if (bothObjects) changes.push(...diffObjects(a, b, nextPath));
    else if (!Object.is(a, b)) changes.push({ type: "changed", path: nextPath, from: a, to: b });
  }

  return changes;
}

const before = { user: { name: "Nitish", flags: { beta: false } }, retries: 2 };
const after = { user: { name: "Nitish", flags: { beta: true } }, retries: 3, mode: "safe" };

console.table(diffObjects(before, after).map(({ path, ...change }) => ({ path: path.join("."), ...change })));
