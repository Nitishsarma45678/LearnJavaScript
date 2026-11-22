/**
 * Exercise: Implement function-constructor inheritance with safe super dispatch.
 * Child methods receive a super-call function as their first argument. The
 * wrapper must not store temporary super state on the instance, so recursion
 * and nested calls remain safe. Static properties should inherit as well.
 * Run: node 07-super-aware-prototype-inheritance.js
 */
"use strict";
const assert = require("node:assert/strict");

function extend(Parent, initialize, methods = {}) {
  if (Parent !== null && typeof Parent !== "function") throw new TypeError("Parent must be a constructor");
  if (typeof initialize !== "function") throw new TypeError("initialize must be a function");

  function Child(...args) {
    if (Parent) Reflect.apply(Parent, this, args);
    Reflect.apply(initialize, this, args);
  }
  Object.setPrototypeOf(Child, Parent || Function.prototype);
  Child.prototype = Object.create(Parent ? Parent.prototype : Object.prototype, {
    constructor: { value: Child, writable: true, configurable: true }
  });

  for (const [name, implementation] of Object.entries(methods)) {
    if (typeof implementation !== "function") throw new TypeError("methods must be functions");
    const parentMethod = Parent?.prototype?.[name];
    Object.defineProperty(Child.prototype, name, {
      configurable: true,
      writable: true,
      value: function (...args) {
        const callSuper = typeof parentMethod === "function"
          ? (...superArgs) => Reflect.apply(parentMethod, this, superArgs)
          : undefined;
        return Reflect.apply(implementation, this, [callSuper, ...args]);
      }
    });
  }
  return Child;
}

function Animal(name) { this.name = name; }
Animal.species = "Animalia";
Animal.prototype.describe = function () { return this.name; };

const Dog = extend(Animal, function (name, breed) {
  this.breed = breed;
}, {
  describe(callSuper) {
    return callSuper() + " the " + this.breed;
  },
  identify(callSuper) {
    return this.describe() + " / " + callSuper();
  }
});

const dog = new Dog("Milo", "collie");
assert.equal(dog.describe(), "Milo the collie");
assert.equal(dog.identify(), "Milo the collie / Milo");
assert.ok(dog instanceof Dog);
assert.ok(dog instanceof Animal);
assert.equal(Dog.species, "Animalia");
assert.equal(dog.constructor, Dog);
assert.equal(Object.prototype.hasOwnProperty.call(dog, "callSuper"), false);
console.log("super-aware prototype inheritance tests passed");
module.exports = { extend };
