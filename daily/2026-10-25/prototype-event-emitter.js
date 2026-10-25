/**
 * Prototype-based event emitter with once listeners and safe unsubscribe.
 * Listeners are invoked from a snapshot so mutations during emission are safe.
 */
function EventEmitter() {
  this.events = new Map();
}
EventEmitter.prototype.on = function (event, listener) {
  if (typeof listener !== "function") throw new TypeError("listener must be a function");
  if (!this.events.has(event)) this.events.set(event, new Set());
  const entry = { listener, once: false };
  this.events.get(event).add(entry);
  return () => this.off(event, listener, entry);
};
EventEmitter.prototype.once = function (event, listener) {
  if (typeof listener !== "function") throw new TypeError("listener must be a function");
  if (!this.events.has(event)) this.events.set(event, new Set());
  const entry = { listener, once: true };
  this.events.get(event).add(entry);
  return () => this.off(event, listener, entry);
};
EventEmitter.prototype.off = function (event, listener, specificEntry) {
  const entries = this.events.get(event);
  if (!entries) return;
  for (const entry of entries) {
    if (specificEntry ? entry === specificEntry : entry.listener === listener) entries.delete(entry);
  }
  if (entries.size === 0) this.events.delete(event);
};
EventEmitter.prototype.emit = function (event, ...args) {
  const entries = this.events.get(event);
  if (!entries) return false;
  for (const entry of [...entries]) {
    if (!entries.has(entry)) continue;
    if (entry.once) entries.delete(entry);
    entry.listener(...args);
  }
  if (entries.size === 0) this.events.delete(event);
  return true;
};

const emitter = new EventEmitter();
let total = 0;
emitter.on("data", n => { total += n; });
emitter.once("data", n => { total += n * 10; });
emitter.emit("data", 1);
emitter.emit("data", 2);
console.assert(total === 13);
console.log("prototype event emitter practice passed");
