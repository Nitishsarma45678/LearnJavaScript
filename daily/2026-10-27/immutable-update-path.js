/**
 * Exercise: Implement immutable nested updates with structural sharing.
 * Only containers along the edited path are copied. Sibling branches retain
 * their original references. Existing object keys and array indexes are required.
 */

function updateIn(root, path, updater) {
  if (!Array.isArray(path)) throw new TypeError("path must be an array");
  if (typeof updater !== "function") throw new TypeError("updater must be a function");
  if (path.length === 0) return updater(root);

  function visit(current, depth) {
    const key = path[depth];
    const isArray = Array.isArray(current);
    if (!isArray && (current === null || typeof current !== "object")) {
      throw new TypeError("Path crosses a non-container at depth " + depth);
    }

    if (isArray) {
      if (!Number.isInteger(key) || key < 0 || key >= current.length) {
        throw new RangeError("Invalid array index at depth " + depth);
      }
    } else if (!Object.prototype.hasOwnProperty.call(current, key)) {
      throw new ReferenceError("Missing object key at depth " + depth + ": " + String(key));
    }

    const oldValue = current[key];
    const nextValue = depth === path.length - 1
      ? updater(oldValue)
      : visit(oldValue, depth + 1);

    if (Object.is(oldValue, nextValue)) return current;
    const copy = isArray ? current.slice() : Object.assign(
      Object.create(Object.getPrototypeOf(current)),
      current
    );
    copy[key] = nextValue;
    return copy;
  }

  return visit(root, 0);
}

function deleteIn(root, path) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new TypeError("deleteIn requires a non-empty path array");
  }
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];
  const parent = parentPath.reduce((value, part) => value[part], root);

  if (Array.isArray(parent)) {
    if (!Number.isInteger(key) || key < 0 || key >= parent.length) {
      throw new RangeError("Invalid array index");
    }
    return updateIn(root, parentPath, (array) => {
      const copy = array.slice();
      copy.splice(key, 1);
      return copy;
    });
  }

  if (parent === null || typeof parent !== "object" ||
      !Object.prototype.hasOwnProperty.call(parent, key)) {
    throw new ReferenceError("Cannot delete a missing key");
  }
  return updateIn(root, parentPath, (object) => {
    const copy = Object.assign(Object.create(Object.getPrototypeOf(object)), object);
    delete copy[key];
    return copy;
  });
}

const original = {
  profile: { name: "Asha", scores: [8, 9, 10] },
  settings: { theme: "dark" }
};
const changed = updateIn(original, ["profile", "scores", 1], (score) => score + 1);

if (changed.profile.scores[1] !== 10) throw new Error("Nested update failed");
if (original.profile.scores[1] !== 9) throw new Error("Original object was mutated");
if (changed === original || changed.profile === original.profile ||
    changed.profile.scores === original.profile.scores) {
  throw new Error("Edited path should have new references");
}
if (changed.settings !== original.settings) {
  throw new Error("Untouched branch should preserve its reference");
}

const unchanged = updateIn(original, ["profile", "name"], (name) => name);
if (unchanged !== original) throw new Error("No-op update should preserve root reference");

const deleted = deleteIn(original, ["profile", "scores", 0]);
if (deleted.profile.scores.join(",") !== "9,10") throw new Error("Array deletion failed");
if (original.profile.scores.join(",") !== "8,9,10") throw new Error("Deletion mutated original");

console.log("Immutable path updates: all tests passed.");
