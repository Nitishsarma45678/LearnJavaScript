/**
 * Practice: Recursive JSON Diff
 *
 * Compare two JSON-compatible values and return a structured list of
 * additions, removals, and changes.
 *
 * Concepts:
 * - recursion
 * - higher-order array processing
 * - object/array algorithms
 * - path construction
 * - deep comparison
 *
 * Arrays are compared by index.
 */

function deepDiff(left, right, path = "$") {
  if (Object.is(left, right)) {
    return [];
  }

  const leftIsObject = left !== null && typeof left === "object";
  const rightIsObject = right !== null && typeof right === "object";

  if (!leftIsObject || !rightIsObject) {
    return [{
      type: "changed",
      path,
      before: left,
      after: right
    }];
  }

  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);

  if (leftIsArray !== rightIsArray) {
    return [{
      type: "changed",
      path,
      before: left,
      after: right
    }];
  }

  const keys = new Set([
    ...Object.keys(left),
    ...Object.keys(right)
  ]);

  return [...keys].sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);

    if (Number.isInteger(aNum) && Number.isInteger(bNum)) {
      return aNum - bNum;
    }

    return a.localeCompare(b);
  }).flatMap(key => {
    const childPath = Array.isArray(left)
      ? `${path}[${key}]`
      : `${path}.${key}`;

    const hasLeft = Object.prototype.hasOwnProperty.call(left, key);
    const hasRight = Object.prototype.hasOwnProperty.call(right, key);

    if (!hasLeft) {
      return [{
        type: "added",
        path: childPath,
        after: right[key]
      }];
    }

    if (!hasRight) {
      return [{
        type: "removed",
        path: childPath,
        before: left[key]
      }];
    }

    return deepDiff(left[key], right[key], childPath);
  });
}

function summarizeDiff(diff) {
  return diff.reduce((summary, item) => {
    summary[item.type]++;
    return summary;
  }, {
    added: 0,
    removed: 0,
    changed: 0
  });
}

// Example
const before = {
  name: "Nitish",
  skills: ["JavaScript", "Python"],
  profile: {
    level: "advanced",
    active: true
  }
};

const after = {
  name: "Nitish",
  skills: ["JavaScript", "TypeScript", "Python"],
  profile: {
    level: "advanced",
    active: false
  },
  location: "Guwahati"
};

const diff = deepDiff(before, after);

console.table(diff);
console.log("Summary:", summarizeDiff(diff));
