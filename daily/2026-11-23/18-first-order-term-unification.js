// Exercise: Implement first-order term unification with an occurs check.
// Terms are variables, constants, or compound terms. Return a substitution Map
// when two terms unify, otherwise return null. Variables are identified by object
// identity, not merely by their display names.
//
// Run: node 18-first-order-term-unification.js
const assert = require("node:assert/strict");

function variable(name) {
  if (typeof name !== "string" || !name) throw new TypeError("variable name required");
  return Object.freeze({ kind: "variable", name });
}

function constant(value) {
  return Object.freeze({ kind: "constant", value });
}

function compound(functor, ...args) {
  if (typeof functor !== "string" || !functor) throw new TypeError("functor required");
  return Object.freeze({ kind: "compound", functor, args: Object.freeze(args) });
}

function dereference(term, substitution) {
  const visited = new Set();
  while (term?.kind === "variable" && substitution.has(term)) {
    if (visited.has(term)) throw new Error("cyclic substitution detected");
    visited.add(term);
    term = substitution.get(term);
  }
  return term;
}

function occurs(target, term, substitution, visited = new Set()) {
  term = dereference(term, substitution);
  if (term === target) return true;
  if (!term || term.kind !== "compound" || visited.has(term)) return false;
  visited.add(term);
  return term.args.some((argument) => occurs(target, argument, substitution, visited));
}

function unify(left, right, initial = new Map()) {
  const substitution = new Map(initial);
  const pending = [[left, right]];

  while (pending.length) {
    let [a, b] = pending.pop();
    a = dereference(a, substitution);
    b = dereference(b, substitution);
    if (a === b) continue;

    if (a?.kind === "variable") {
      if (occurs(a, b, substitution)) return null;
      substitution.set(a, b);
      continue;
    }
    if (b?.kind === "variable") {
      if (occurs(b, a, substitution)) return null;
      substitution.set(b, a);
      continue;
    }

    if (!a || !b || a.kind !== b.kind) return null;
    if (a.kind === "constant") {
      if (!Object.is(a.value, b.value)) return null;
      continue;
    }
    if (a.kind !== "compound" || a.functor !== b.functor ||
        a.args.length !== b.args.length) return null;

    for (let i = 0; i < a.args.length; i += 1) {
      pending.push([a.args[i], b.args[i]]);
    }
  }
  return substitution;
}

function applySubstitution(term, substitution, active = new Set()) {
  term = dereference(term, substitution);
  if (term?.kind === "compound") {
    if (active.has(term)) throw new Error("cyclic term graph");
    const next = new Set(active);
    next.add(term);
    return compound(
      term.functor,
      ...term.args.map((argument) => applySubstitution(argument, substitution, next))
    );
  }
  return term;
}

function formatTerm(term, substitution = new Map()) {
  term = dereference(term, substitution);
  if (term?.kind === "variable") return term.name;
  if (term?.kind === "constant") return String(term.value);
  if (term?.kind === "compound") {
    return term.functor + "(" + term.args.map((arg) => formatTerm(arg, substitution)).join(", ") + ")";
  }
  throw new TypeError("invalid term");
}

// Example tests
{
  const x = variable("X");
  const y = variable("Y");
  const left = compound("pair", x, constant("a"));
  const right = compound("pair", constant("b"), y);
  const result = unify(left, right);
  assert.ok(result);
  assert.equal(formatTerm(x, result), "b");
  assert.equal(formatTerm(y, result), "a");
  assert.equal(formatTerm(applySubstitution(left, result)), "pair(b, a)");

  const recursive = variable("R");
  assert.equal(unify(recursive, compound("list", recursive)), null);
  assert.equal(unify(constant(1), constant(2)), null);
  assert.equal(unify(compound("f", x), compound("g", x)), null);
  assert.equal(formatTerm(compound("node", constant(1), constant(2))), "node(1, 2)");
}
console.log("term unification tests passed");
