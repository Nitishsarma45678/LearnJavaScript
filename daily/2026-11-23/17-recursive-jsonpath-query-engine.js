// Exercise: Implement a small JSONPath query engine.
// Supported syntax: $, .name, ['name'], [index], [*], ..name and ..*.
// Return both matched values and their paths. Recursive descent must tolerate
// cyclic object graphs without following a cycle forever.
//
// Run: node 17-recursive-jsonpath-query-engine.js
const assert = require("node:assert/strict");

function parsePath(expression) {
  if (typeof expression !== "string" || expression[0] !== "$") {
    throw new SyntaxError("query must begin with $");
  }
  const tokens = [];
  let i = 1;

  while (i < expression.length) {
    if (/\s/.test(expression[i])) { i += 1; continue; }

    if (expression.startsWith("..", i)) {
      i += 2;
      if (expression[i] === "*") {
        tokens.push({ type: "recursive", key: "*" });
        i += 1;
      } else {
        const match = /^[A-Za-z_$][\w$]*/.exec(expression.slice(i));
        if (!match) throw new SyntaxError("expected property name after ..");
        tokens.push({ type: "recursive", key: match[0] });
        i += match[0].length;
      }
      continue;
    }

    if (expression[i] === ".") {
      i += 1;
      if (expression[i] === "*") {
        tokens.push({ type: "wildcard" });
        i += 1;
      } else {
        const match = /^[A-Za-z_$][\w$]*/.exec(expression.slice(i));
        if (!match) throw new SyntaxError("expected property name after .");
        tokens.push({ type: "child", key: match[0] });
        i += match[0].length;
      }
      continue;
    }

    if (expression[i] === "[") {
      i += 1;
      while (/\s/.test(expression[i] || "")) i += 1;
      if (expression[i] === "*") {
        tokens.push({ type: "wildcard" });
        i += 1;
      } else if (expression[i] === '"' || expression[i] === "'") {
        const quote = expression[i++];
        let key = "";
        let closed = false;
        while (i < expression.length) {
          const ch = expression[i++];
          if (ch === quote) { closed = true; break; }
          if (ch === "\\" && i < expression.length) {
            const escaped = expression[i++];
            key += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
          } else key += ch;
        }
        if (!closed) throw new SyntaxError("unterminated quoted property");
        tokens.push({ type: "child", key });
      } else {
        const match = /^-?\d+/.exec(expression.slice(i));
        if (!match) throw new SyntaxError("expected array index or quoted property");
        tokens.push({ type: "index", index: Number(match[0]) });
        i += match[0].length;
      }
      while (/\s/.test(expression[i] || "")) i += 1;
      if (expression[i] !== "]") throw new SyntaxError("expected ]");
      i += 1;
      continue;
    }

    throw new SyntaxError("unexpected character at position " + i);
  }
  return tokens;
}

function queryPath(root, expression) {
  const tokens = parsePath(expression);
  let matches = [{ value: root, path: "$" }];

  const childrenOf = (value) => {
    if (value === null || typeof value !== "object") return [];
    return Object.keys(value).map((key) => ({
      key,
      value: value[key],
      path: Array.isArray(value) && /^\d+$/.test(key)
        ? "[" + key + "]"
        : "[" + JSON.stringify(key) + "]"
    }));
  };

  for (const token of tokens) {
    const next = [];
    for (const match of matches) {
      const value = match.value;
      if (token.type === "child") {
        if (value !== null && typeof value === "object" &&
            Object.prototype.hasOwnProperty.call(value, token.key)) {
          next.push({ value: value[token.key], path: match.path + "[" + JSON.stringify(token.key) + "]" });
        }
      } else if (token.type === "index") {
        if (Array.isArray(value)) {
          const index = token.index < 0 ? value.length + token.index : token.index;
          if (index >= 0 && index < value.length && index in value) {
            next.push({ value: value[index], path: match.path + "[" + index + "]" });
          }
        }
      } else if (token.type === "wildcard") {
        for (const child of childrenOf(value)) {
          next.push({ value: child.value, path: match.path + child.path });
        }
      } else if (token.type === "recursive") {
        const walk = (current, currentPath, ancestors) => {
          for (const child of childrenOf(current)) {
            const childPath = currentPath + child.path;
            if (token.key === "*" || child.key === token.key) {
              next.push({ value: child.value, path: childPath });
            }
            if (child.value !== null && typeof child.value === "object" &&
                !ancestors.has(child.value)) {
              const branch = new Set(ancestors);
              branch.add(child.value);
              walk(child.value, childPath, branch);
            }
          }
        };
        const ancestors = new Set();
        if (value !== null && typeof value === "object") ancestors.add(value);
        walk(value, match.path, ancestors);
      }
    }
    matches = next;
  }
  return matches;
}

// Example tests
{
  const data = {
    store: {
      books: [{ title: "A", price: 8 }, { title: "B", price: 12 }],
      owner: { name: "Ada" }
    }
  };
  assert.deepEqual(queryPath(data, "$.store.books[1].title").map((x) => x.value), ["B"]);
  assert.deepEqual(queryPath(data, "$.store.books[*].price").map((x) => x.value), [8, 12]);
  assert.deepEqual(queryPath(data, "$..name").map((x) => x.value), ["Ada"]);
  assert.deepEqual(queryPath(data, "$['store'].books[-1].title").map((x) => x.value), ["B"]);

  const cyclic = { name: "root", child: { name: "leaf" } };
  cyclic.child.parent = cyclic;
  assert.deepEqual(queryPath(cyclic, "$..name").map((x) => x.value), ["root", "leaf"]);
  assert.throws(() => parsePath("$.items["), /expected/);
  assert.throws(() => parsePath("items"), /begin/);
}
console.log("JSONPath query tests passed");
