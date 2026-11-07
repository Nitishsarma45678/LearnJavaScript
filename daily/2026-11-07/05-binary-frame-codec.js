'use strict';

/**
 * Exercise: Design a small checksummed binary framing protocol.
 *
 * Frame layout (network byte order):
 *   magic[2] | version[1] | flags[1] | payloadLength[4] | payload[n] | crc32[4]
 *
 * The streaming decoder must accept arbitrary chunk boundaries, emit multiple
 * frames per push, enforce a payload limit, validate reserved flag bits and
 * checksums, and detect incomplete input when finish() is called.
 */

const MAGIC_0 = 0xCA;
const MAGIC_1 = 0xFE;
const VERSION = 1;
const HEADER_SIZE = 8;
const CHECKSUM_SIZE = 4;
const ALLOWED_FLAGS = 0b00000011;

function protocolError(message) {
  const error = new Error(message);
  error.name = 'FrameProtocolError';
  return error;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let value = n;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xEDB88320 : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function asBytes(value, name) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${name} must be a Uint8Array`);
  return value;
}

function encodeFrame(payload, { version = VERSION, flags = 0 } = {}) {
  asBytes(payload, 'payload');
  if (!Number.isInteger(version) || version !== VERSION) throw new RangeError('unsupported protocol version');
  if (!Number.isInteger(flags) || flags < 0 || (flags & ~ALLOWED_FLAGS) !== 0) throw new RangeError('flags contain reserved bits');
  if (payload.length > 0xFFFFFFFF) throw new RangeError('payload is too large for the wire format');

  const frame = new Uint8Array(HEADER_SIZE + payload.length + CHECKSUM_SIZE);
  const view = new DataView(frame.buffer);
  frame[0] = MAGIC_0;
  frame[1] = MAGIC_1;
  frame[2] = version;
  frame[3] = flags;
  view.setUint32(4, payload.length, false);
  frame.set(payload, HEADER_SIZE);
  const checksum = crc32(frame.subarray(2, HEADER_SIZE + payload.length));
  view.setUint32(HEADER_SIZE + payload.length, checksum, false);
  return frame;
}

function concatBytes(left, right) {
  if (left.length === 0) return right.slice();
  if (right.length === 0) return left.slice();
  const result = new Uint8Array(left.length + right.length);
  result.set(left);
  result.set(right, left.length);
  return result;
}

class FrameDecoder {
  constructor({ maxPayload = 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(maxPayload) || maxPayload < 0) throw new RangeError('maxPayload must be a non-negative safe integer');
    this.maxPayload = maxPayload;
    this.buffer = new Uint8Array(0);
  }

  _fail(message) {
    this.buffer = new Uint8Array(0);
    throw protocolError(message);
  }

  push(chunk) {
    asBytes(chunk, 'chunk');
    this.buffer = concatBytes(this.buffer, chunk);
    const frames = [];

    try {
      while (this.buffer.length >= HEADER_SIZE) {
        if (this.buffer[0] !== MAGIC_0 || this.buffer[1] !== MAGIC_1) this._fail('invalid frame magic');
        const version = this.buffer[2];
        const flags = this.buffer[3];
        if (version !== VERSION) this._fail(`unsupported version: ${version}`);
        if ((flags & ~ALLOWED_FLAGS) !== 0) this._fail('reserved flag bits are set');

        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
        const payloadLength = view.getUint32(4, false);
        if (payloadLength > this.maxPayload) this._fail(`payload exceeds configured limit (${this.maxPayload})`);
        const frameLength = HEADER_SIZE + payloadLength + CHECKSUM_SIZE;
        if (this.buffer.length < frameLength) break;

        const expectedChecksum = view.getUint32(HEADER_SIZE + payloadLength, false);
        const actualChecksum = crc32(this.buffer.subarray(2, HEADER_SIZE + payloadLength));
        if (actualChecksum !== expectedChecksum) this._fail('checksum mismatch');

        frames.push(Object.freeze({
          version,
          flags,
          payload: this.buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLength),
        }));
        this.buffer = this.buffer.slice(frameLength);
      }
    } catch (error) {
      // A malformed frame invalidates the current stream. Do not retain a
      // potentially desynchronized suffix for a later push().
      this.buffer = new Uint8Array(0);
      throw error;
    }
    return frames;
  }

  finish() {
    if (this.buffer.length !== 0) this._fail(`truncated stream: ${this.buffer.length} unconsumed byte(s)`);
    return true;
  }

  reset() { this.buffer = new Uint8Array(0); }
  get bufferedBytes() { return this.buffer.length; }
}

// ------------------------------ Tests ------------------------------------
if (require.main === module) {
  const assert = require('node:assert/strict');
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const firstPayload = encoder.encode('hello \ud83c\udf0d');
  const secondPayload = new Uint8Array([0, 1, 2, 255]);
  const first = encodeFrame(firstPayload, { flags: 1 });
  const second = encodeFrame(secondPayload, { flags: 2 });
  const combined = concatBytes(first, second);

  // Every possible single split point must decode to the same two frames.
  for (let split = 0; split <= combined.length; split++) {
    const stream = new FrameDecoder();
    const output = [
      ...stream.push(combined.subarray(0, split)),
      ...stream.push(combined.subarray(split)),
    ];
    assert.equal(output.length, 2, `split ${split}`);
    assert.equal(decoder.decode(output[0].payload), 'hello \ud83c\udf0d');
    assert.deepEqual([...output[1].payload], [0, 1, 2, 255]);
    assert.equal(output[0].flags, 1);
    assert.equal(output[1].flags, 2);
    assert.equal(stream.finish(), true);
  }

  const bytewise = new FrameDecoder();
  const bytewiseFrames = [];
  for (const byte of combined) bytewiseFrames.push(...bytewise.push(Uint8Array.of(byte)));
  assert.equal(bytewiseFrames.length, 2);
  assert.equal(bytewise.bufferedBytes, 0);
  assert.equal(bytewise.finish(), true);

  const empty = new FrameDecoder();
  assert.equal(empty.push(encodeFrame(new Uint8Array(0))).length, 1);
  assert.equal(empty.finish(), true);

  const corrupt = first.slice();
  corrupt[HEADER_SIZE] ^= 0x40;
  const corruptDecoder = new FrameDecoder();
  assert.throws(() => corruptDecoder.push(corrupt), /checksum mismatch/);
  assert.equal(corruptDecoder.bufferedBytes, 0);

  const badMagic = first.slice();
  badMagic[0] = 0;
  assert.throws(() => new FrameDecoder().push(badMagic), /magic/);
  assert.throws(() => new FrameDecoder({ maxPayload: 2 }).push(first), /configured limit/);
  const partialHeader = new FrameDecoder();
  assert.deepEqual(partialHeader.push(first.subarray(0, 5)), []);
  assert.equal(partialHeader.bufferedBytes, 5);
  assert.throws(() => partialHeader.finish(), /truncated stream/);
  const truncated = new FrameDecoder();
  truncated.push(first.subarray(0, first.length - 1));
  assert.throws(() => truncated.finish(), /truncated stream/);
  assert.throws(() => encodeFrame(firstPayload, { flags: 8 }), /reserved/);

  console.log('binary-frame-codec: all tests passed');
}

module.exports = { encodeFrame, FrameDecoder, crc32 };
