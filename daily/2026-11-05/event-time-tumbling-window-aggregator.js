"use strict";

/*
 * Exercise: aggregate an asynchronous event stream into keyed tumbling
 * windows using explicit watermarks and an allowed-lateness interval.
 *
 * Input records:
 *   { type: "event", timestamp, key, value }
 *   { type: "watermark", timestamp }
 *
 * A window [start, end) is emitted only when watermark >= end + allowedLateness.
 * Events arriving after that point are sent to onLate and are not re-opened.
 * At end-of-stream all remaining windows are emitted.
 *
 * The aggregation hooks are synchronous to keep ordering deterministic.
 */

async function* aggregateTumblingWindows(source, options = {}) {
  if (source == null || typeof source[Symbol.asyncIterator] !== "function") {
    throw new TypeError("source must be an AsyncIterable");
  }

  const size = options.size;
  const allowedLateness = options.allowedLateness ?? 0;
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError("size must be a positive finite number");
  }
  if (!Number.isFinite(allowedLateness) || allowedLateness < 0) {
    throw new RangeError("allowedLateness must be a non-negative finite number");
  }

  const keyBy = options.keyBy ?? (record => record.key ?? "all");
  const createAccumulator = options.createAccumulator ?? (() => ({ count: 0, sum: 0 }));
  const add = options.add ?? ((accumulator, record) => {
    accumulator.count += 1;
    const value = Number(record.value);
    if (!Number.isFinite(value)) throw new TypeError("Default sum requires finite numeric values");
    accumulator.sum += value;
  });
  const finish = options.finish ?? (accumulator => ({ ...accumulator }));
  const onLate = options.onLate ?? (() => {});

  for (const [name, fn] of Object.entries({
    keyBy, createAccumulator, add, finish, onLate
  })) {
    if (typeof fn !== "function") throw new TypeError(name + " must be a function");
  }

  // start -> key -> bucket. Map keys preserve object identity as well as primitives.
  const windows = new Map();
  let watermark = -Infinity;
  let sequence = 0;

  function drain(upToWatermark) {
    const ready = [];

    for (const [start, keyedBuckets] of windows) {
      for (const [key, bucket] of keyedBuckets) {
        if (bucket.end + allowedLateness <= upToWatermark) {
          ready.push(bucket);
          keyedBuckets.delete(key);
        }
      }
      if (keyedBuckets.size === 0) windows.delete(start);
    }

    ready.sort((a, b) =>
      a.end - b.end ||
      a.start - b.start ||
      a.sequence - b.sequence
    );

    return ready.map(bucket => ({
      start: bucket.start,
      end: bucket.end,
      key: bucket.key,
      value: finish(bucket.accumulator, bucket)
    }));
  }

  for await (const record of source) {
    if (record == null || typeof record !== "object") {
      throw new TypeError("Every input record must be an object");
    }

    if (record.type === "watermark") {
      const nextWatermark = record.timestamp;
      if (!Number.isFinite(nextWatermark)) {
        throw new TypeError("Watermark timestamp must be finite");
      }
      if (nextWatermark < watermark) {
        throw new RangeError("Watermarks must be monotonically non-decreasing");
      }
      watermark = nextWatermark;

      for (const completed of drain(watermark)) yield completed;
      continue;
    }

    if (record.type !== "event") {
      throw new TypeError("Record type must be event or watermark");
    }
    if (!Number.isFinite(record.timestamp)) {
      throw new TypeError("Event timestamp must be finite");
    }

    const start = Math.floor(record.timestamp / size) * size;
    const end = start + size;

    if (end + allowedLateness <= watermark) {
      onLate(record, { watermark, start, end });
      continue;
    }

    const key = keyBy(record);
    let keyedBuckets = windows.get(start);
    if (!keyedBuckets) {
      keyedBuckets = new Map();
      windows.set(start, keyedBuckets);
    }

    let bucket = keyedBuckets.get(key);
    if (!bucket) {
      bucket = {
        start,
        end,
        key,
        sequence: sequence++,
        accumulator: createAccumulator(record, { start, end, key })
      };
      keyedBuckets.set(key, bucket);
    }
    add(bucket.accumulator, record, bucket);
  }

  // End-of-stream acts as an infinite watermark.
  for (const completed of drain(Infinity)) yield completed;
}

if (require.main === module) {
  const assert = require("node:assert/strict");

  async function* sampleInput() {
    yield { type: "event", timestamp: 2, key: "A", value: 3 };
    yield { type: "event", timestamp: 8, key: "A", value: 4 };
    yield { type: "watermark", timestamp: 15 };
    yield { type: "event", timestamp: 4, key: "A", value: 99 }; // too late
    yield { type: "event", timestamp: 12, key: "B", value: 5 };
    yield { type: "watermark", timestamp: 25 };
  }

  async function run() {
    const late = [];
    const output = [];
    for await (const window of aggregateTumblingWindows(sampleInput(), {
      size: 10,
      allowedLateness: 5,
      onLate: record => late.push(record)
    })) {
      output.push(window);
    }

    assert.deepEqual(output, [
      { start: 0, end: 10, key: "A", value: { count: 2, sum: 7 } },
      { start: 10, end: 20, key: "B", value: { count: 1, sum: 5 } }
    ]);
    assert.equal(late.length, 1);
    assert.equal(late[0].value, 99);

    async function* decreasingWatermarks() {
      yield { type: "watermark", timestamp: 20 };
      yield { type: "watermark", timestamp: 19 };
    }
    await assert.rejects(async () => {
      for await (const ignored of aggregateTumblingWindows(decreasingWatermarks(), { size: 10 })) {
        void ignored;
      }
    }, RangeError);

    async function* empty() {}
    const emptyOutput = [];
    for await (const item of aggregateTumblingWindows(empty(), { size: 5 })) {
      emptyOutput.push(item);
    }
    assert.deepEqual(emptyOutput, []);

    console.log("Event-time tumbling windows: all tests passed.");
  }

  run().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { aggregateTumblingWindows };
