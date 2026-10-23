/**
 * Event-time tumbling-window aggregator
 *
 * Aggregates numeric events into fixed-size windows using event timestamps,
 * not arrival order. A watermark (max event time - allowed lateness) decides
 * when a window is complete. Events arriving after their window is closed
 * are rejected as late.
 *
 * Run: node event-time-window-aggregator.js
 */

class EventTimeWindowAggregator {
  constructor({ windowSizeMs, allowedLatenessMs = 0 } = {}) {
    if (!Number.isFinite(windowSizeMs) || windowSizeMs <= 0) {
      throw new RangeError("windowSizeMs must be a positive finite number");
    }
    if (!Number.isFinite(allowedLatenessMs) || allowedLatenessMs < 0) {
      throw new RangeError("allowedLatenessMs must be a non-negative finite number");
    }

    this.windowSizeMs = windowSizeMs;
    this.allowedLatenessMs = allowedLatenessMs;
    this.maxEventTime = -Infinity;
    this.windows = new Map(); // key -> Map(windowStart -> aggregate)
    this.lateEventCount = 0;
  }

  get watermark() {
    return this.maxEventTime === -Infinity
      ? -Infinity
      : this.maxEventTime - this.allowedLatenessMs;
  }

  add({ key, timestamp, value }) {
    if (typeof key !== "string" && typeof key !== "number") {
      throw new TypeError("key must be a string or number");
    }
    if (!Number.isFinite(timestamp)) {
      throw new TypeError("timestamp must be a finite number");
    }
    if (!Number.isFinite(value)) {
      throw new TypeError("value must be a finite number");
    }

    this.maxEventTime = Math.max(this.maxEventTime, timestamp);

    const windowStart = Math.floor(timestamp / this.windowSizeMs) * this.windowSizeMs;
    const windowEnd = windowStart + this.windowSizeMs;

    if (windowEnd <= this.watermark) {
      this.lateEventCount += 1;
      return { accepted: false, reason: "late", emitted: this.#closeReadyWindows() };
    }

    let keyWindows = this.windows.get(key);
    if (!keyWindows) {
      keyWindows = new Map();
      this.windows.set(key, keyWindows);
    }

    let aggregate = keyWindows.get(windowStart);
    if (!aggregate) {
      aggregate = {
        key,
        windowStart,
        windowEnd,
        count: 0,
        sum: 0,
        min: Infinity,
        max: -Infinity,
      };
      keyWindows.set(windowStart, aggregate);
    }

    aggregate.count += 1;
    aggregate.sum += value;
    aggregate.min = Math.min(aggregate.min, value);
    aggregate.max = Math.max(aggregate.max, value);

    return { accepted: true, emitted: this.#closeReadyWindows() };
  }

  flush() {
    return this.#closeReadyWindows(true);
  }

  #closeReadyWindows(force = false) {
    const ready = [];

    for (const [key, keyWindows] of this.windows) {
      for (const [start, aggregate] of keyWindows) {
        if (force || aggregate.windowEnd <= this.watermark) {
          ready.push({
            ...aggregate,
            average: aggregate.sum / aggregate.count,
          });
          keyWindows.delete(start);
        }
      }

      if (keyWindows.size === 0) this.windows.delete(key);
    }

    ready.sort((a, b) =>
      a.windowEnd - b.windowEnd ||
      String(a.key).localeCompare(String(b.key)) ||
      a.windowStart - b.windowStart
    );

    return ready;
  }
}

// Demo with out-of-order arrivals and one event that is too late.
const aggregator = new EventTimeWindowAggregator({
  windowSizeMs: 10,
  allowedLatenessMs: 5,
});

const events = [
  { key: "api", timestamp: 2, value: 120 },
  { key: "api", timestamp: 8, value: 180 },
  { key: "worker", timestamp: 6, value: 40 },
  { key: "api", timestamp: 19, value: 200 }, // advances the watermark to 14
  { key: "api", timestamp: 4, value: 90 },   // window [0, 10) is already closed
  { key: "api", timestamp: 23, value: 160 },
];

for (const event of events) {
  const result = aggregator.add(event);
  if (!result.accepted) {
    console.log("Rejected late event:", event);
  }
  for (const window of result.emitted) {
    console.log("Completed window:", window);
  }
}

console.log("Final windows:", aggregator.flush());
console.log("Late events rejected:", aggregator.lateEventCount);
