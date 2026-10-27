/**
 * Exercise: Implement JSON Pointer-style path access.
 * Supports RFC 6901 token escaping (~1 for slash, ~0 for tilde), object
 * properties, array indexes, append via "-" for set, and remove.
 * Mutation functions intentionally modify the supplied document.
 */

function decodeToken(token) {
  // A tilde must be followed by 0 or 1; reject malformed escapes.
  if (/~(?![01])/.test(token)) {
    throw new SyntaxError("Invalid JSON Pointer escape in token: " + token);
  }
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function parsePointer(pointer) {
  if (pointer === "") return [];
  if (typeof pointer !== "string" || pointer[0] !== "/") {
    throw new SyntaxError("A non-root JSON Pointer must begin with '/'");
  }
  return pointer.slice(1).split("/").map(decodeToken);
}

function arrayIndex(token, length, allowAppend) {
  if (allowAppend && token === "-") return length;
  if (!/^(0|[1-9]\d*)$/.test(token)) {
    throw new TypeError("Invalid array index: " + token);
  }
  const index = Number(token);
  if (!Number.isSafeInteger(index) || index > length) {
    throw new RangeError("Array index out of bounds: " + token);
  }
  return index;
}

function getPointer(document, pointer) {
  const tokens = parsePointer(pointer);
  let current = document;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = arrayIndex(token, current.length, false);
      if (index >= current.length) throw new RangeError("Array index out of bounds");
      current = current[index];
    } else if (current !== null && typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        throw new ReferenceError("Missing property: " + token);
      }
      current = current[token];
    } else {
      throw new TypeError("Cannot traverse through a primitive value");
    }
  }
  return current;
}

function setPointer(document, pointer, value) {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) throw new TypeError("Replacing the root requires assigning the returned value");
  let parent = document;

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i];
    if (Array.isArray(parent)) {
      const index = arrayIndex(token, parent.length, false);
      if (index >= parent.length) throw new RangeError("Array index out of bounds");
      parent = parent[index];
    } else if (parent !== null && typeof parent === "object") {
      if (!Object.prototype.hasOwnProperty.call(parent, token)) {
        throw new ReferenceError("Missing intermediate property: " + token);
      }
      parent = parent[token];
    } else {
      throw new TypeError("Cannot traverse through a primitive value");
    }
  }

  const finalToken = tokens[tokens.length - 1];
  if (Array.isArray(parent)) {
    const index = arrayIndex(finalToken, parent.length, true);
    if (index > parent.length) throw new RangeError("Array indexes cannot skip elements");
    if (index === parent.length) parent.push(value);
    else parent[index] = value;
  } else if (parent !== null && typeof parent === "object") {
    parent[finalToken] = value;
  } else {
    throw new TypeError("Pointer parent is not a container");
  }
  return document;
}

function removePointer(document, pointer) {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) throw new TypeError("Removing the root is not supported");
  const parentPointer = tokens.length === 1 ? "" : "/" + tokens.slice(0, -1)
    .map((token) => token.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/");
  const parent = getPointer(document, parentPointer);
  const token = tokens[tokens.length - 1];

  if (Array.isArray(parent)) {
    const index = arrayIndex(token, parent.length, false);
    if (index >= parent.length) throw new RangeError("Array index out of bounds");
    return parent.splice(index, 1)[0];
  }
  if (parent !== null && typeof parent === "object" &&
      Object.prototype.hasOwnProperty.call(parent, token)) {
    const removed = parent[token];
    delete parent[token];
    return removed;
  }
  throw new ReferenceError("Cannot remove missing property: " + token);
}

function assertEqual(actual, expected, label) {
  if (!Object.is(actual, expected)) {
    throw new Error(label + ": expected " + String(expected) + ", received " + String(actual));
  }
}

const doc = {
  "a/b": { "~key": [10, { active: true }] },
  tags: ["js", "sql"]
};
assertEqual(getPointer(doc, "/a~1b/~0key/1/active"), true, "escaped object keys");
setPointer(doc, "/a~1b/~0key/0", 42);
assertEqual(getPointer(doc, "/a~1b/~0key/0"), 42, "array replacement");
setPointer(doc, "/tags/-", "cloud");
assertEqual(getPointer(doc, "/tags/2"), "cloud", "array append");
assertEqual(removePointer(doc, "/tags/1"), "sql", "array removal result");
assertEqual(getPointer(doc, "/tags/1"), "cloud", "array shifts after removal");
setPointer(doc, "/newKey", 7);
assertEqual(getPointer(doc, "/newKey"), 7, "object property creation");

let invalidEscape = false;
try { parsePointer("/bad~2escape"); } catch (error) { invalidEscape = error instanceof SyntaxError; }
if (!invalidEscape) throw new Error("Malformed escape should throw SyntaxError");

console.log("JSON Pointer: all tests passed.");
