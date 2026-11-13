'use strict';

/*
 * Exercise: Implement a piece-table text buffer with undo and redo.
 *
 * The original text is immutable. Inserted text is appended to an add buffer;
 * pieces point into one of those buffers. Edits split pieces at boundaries
 * and coalesce adjacent compatible pieces. History stores compact snapshots
 * of piece metadata rather than copying the entire document.
 *
 * Indices intentionally follow JavaScript string semantics (UTF-16 code
 * units), just like String.prototype.slice.
 */

const assert = require('node:assert/strict');

class PieceTable {
  constructor(initialText = '', options = {}) {
    if (typeof initialText !== 'string') throw new TypeError('initialText must be a string');
    const maxHistory = options.maxHistory === undefined ? 100 : options.maxHistory;
    if (!Number.isInteger(maxHistory) || maxHistory < 0) {
      throw new RangeError('maxHistory must be a non-negative integer');
    }

    this.original = initialText;
    this.addBuffer = '';
    this.pieces = initialText.length
      ? [{ source: 'original', start: 0, length: initialText.length }]
      : [];
    this.length = initialText.length;
    this.maxHistory = maxHistory;
    this.undoStack = [];
    this.redoStack = [];
  }

  _snapshot() {
    return {
      pieces: this.pieces.map(piece => ({ ...piece })),
      addBuffer: this.addBuffer,
      length: this.length
    };
  }

  _restore(snapshot) {
    this.pieces = snapshot.pieces.map(piece => ({ ...piece }));
    this.addBuffer = snapshot.addBuffer;
    this.length = snapshot.length;
  }

  _pushBounded(stack, snapshot) {
    if (this.maxHistory === 0) return;
    stack.push(snapshot);
    if (stack.length > this.maxHistory) stack.shift();
  }

  _mutate(operation) {
    const before = this._snapshot();
    const changed = operation();
    if (!changed) return false;
    this._coalesce();
    this.undoStack.push(before);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
    this.assertValid();
    return true;
  }

  _bufferFor(piece) {
    return piece.source === 'original' ? this.original : this.addBuffer;
  }

  _splitAt(position) {
    let cursor = 0;
    for (let index = 0; index < this.pieces.length; index += 1) {
      const piece = this.pieces[index];
      const nextCursor = cursor + piece.length;

      if (position === cursor) return index;
      if (position === nextCursor) return index + 1;

      if (position > cursor && position < nextCursor) {
        const leftLength = position - cursor;
        const left = {
          source: piece.source,
          start: piece.start,
          length: leftLength
        };
        const right = {
          source: piece.source,
          start: piece.start + leftLength,
          length: piece.length - leftLength
        };
        this.pieces.splice(index, 1, left, right);
        return index + 1;
      }
      cursor = nextCursor;
    }
    if (position === this.length) return this.pieces.length;
    throw new RangeError('position is outside the document');
  }

  _coalesce() {
    const compact = [];
    for (const piece of this.pieces) {
      if (piece.length === 0) continue;
      const previous = compact[compact.length - 1];
      if (previous &&
          previous.source === piece.source &&
          previous.start + previous.length === piece.start) {
        previous.length += piece.length;
      } else {
        compact.push({ ...piece });
      }
    }
    this.pieces = compact;
  }

  _validatePosition(position, name) {
    if (!Number.isInteger(position) || position < 0 || position > this.length) {
      throw new RangeError(name + ' must be an integer from 0 through ' + this.length);
    }
  }

  _validateRange(start, end) {
    this._validatePosition(start, 'start');
    this._validatePosition(end, 'end');
    if (end < start) throw new RangeError('end must not be before start');
  }

  insert(position, text) {
    this._validatePosition(position, 'position');
    if (typeof text !== 'string') throw new TypeError('inserted text must be a string');
    if (text.length === 0) return false;

    return this._mutate(() => {
      const pieceIndex = this._splitAt(position);
      const addStart = this.addBuffer.length;
      this.addBuffer += text;
      this.pieces.splice(pieceIndex, 0, {
        source: 'add',
        start: addStart,
        length: text.length
      });
      this.length += text.length;
      return true;
    });
  }

  delete(start, end) {
    this._validateRange(start, end);
    if (start === end) return false;

    return this._mutate(() => {
      const firstPiece = this._splitAt(start);
      const afterLastPiece = this._splitAt(end);
      this.pieces.splice(firstPiece, afterLastPiece - firstPiece);
      this.length -= end - start;
      return true;
    });
  }

  replace(start, end, text) {
    this._validateRange(start, end);
    if (typeof text !== 'string') throw new TypeError('replacement must be a string');
    if (this.slice(start, end) === text) return false;

    return this._mutate(() => {
      const firstPiece = this._splitAt(start);
      const afterLastPiece = this._splitAt(end);
      this.pieces.splice(firstPiece, afterLastPiece - firstPiece);
      this.length -= end - start;

      if (text.length > 0) {
        const addStart = this.addBuffer.length;
        this.addBuffer += text;
        this.pieces.splice(firstPiece, 0, {
          source: 'add',
          start: addStart,
          length: text.length
        });
        this.length += text.length;
      }
      return true;
    });
  }

  slice(start = 0, end = this.length) {
    this._validateRange(start, end);
    if (start === end) return '';

    let cursor = 0;
    let result = '';
    for (const piece of this.pieces) {
      const pieceEnd = cursor + piece.length;
      const overlapStart = Math.max(start, cursor);
      const overlapEnd = Math.min(end, pieceEnd);
      if (overlapStart < overlapEnd) {
        const localStart = piece.start + overlapStart - cursor;
        const localEnd = piece.start + overlapEnd - cursor;
        result += this._bufferFor(piece).slice(localStart, localEnd);
      }
      if (pieceEnd >= end) break;
      cursor = pieceEnd;
    }
    return result;
  }

  toString() {
    return this.slice(0, this.length);
  }

  undo() {
    if (this.undoStack.length === 0) return false;
    this._pushBounded(this.redoStack, this._snapshot());
    this._restore(this.undoStack.pop());
    this.assertValid();
    return true;
  }

  redo() {
    if (this.redoStack.length === 0) return false;
    this._pushBounded(this.undoStack, this._snapshot());
    this._restore(this.redoStack.pop());
    this.assertValid();
    return true;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  assertValid() {
    let total = 0;
    for (const piece of this.pieces) {
      const buffer = this._bufferFor(piece);
      if (!Number.isInteger(piece.start) || !Number.isInteger(piece.length) ||
          piece.start < 0 || piece.length <= 0 ||
          piece.start + piece.length > buffer.length) {
        throw new Error('Invalid piece descriptor');
      }
      total += piece.length;
    }
    if (total !== this.length) throw new Error('Piece lengths do not match document length');
    return true;
  }

  debugPieces() {
    return this.pieces.map(piece => ({ ...piece }));
  }
}

// Example usage and tests.
function runTests() {
  const editor = new PieceTable('hello world');
  assert.equal(editor.toString(), 'hello world');
  editor.insert(5, ', brave');
  assert.equal(editor.toString(), 'hello, brave world');
  editor.delete(5, 12);
  assert.equal(editor.toString(), 'hello world');
  editor.replace(6, 11, 'JavaScript');
  assert.equal(editor.toString(), 'hello JavaScript');

  assert.equal(editor.undo(), true);
  assert.equal(editor.toString(), 'hello world');
  assert.equal(editor.undo(), true);
  assert.equal(editor.toString(), 'hello, brave world');
  assert.equal(editor.redo(), true);
  assert.equal(editor.toString(), 'hello world');
  assert.equal(editor.redo(), true);
  assert.equal(editor.toString(), 'hello JavaScript');
  assert.equal(editor.canRedo, false);

  const boundaries = new PieceTable('abcd');
  boundaries.insert(0, '!');
  boundaries.insert(boundaries.length, '?');
  assert.equal(boundaries.toString(), '!abcd?');
  boundaries.delete(1, 5);
  assert.equal(boundaries.toString(), '!?');
  boundaries.replace(1, 2, 'END');
  assert.equal(boundaries.toString(), '!END');
  assert.equal(boundaries.slice(1, 4), 'END');
  assert.equal(boundaries.assertValid(), true);

  const unicode = new PieceTable('A🙂B');
  unicode.insert(1, 'x');
  assert.equal(unicode.toString(), 'Ax🙂B');
  unicode.delete(1, 2);
  assert.equal(unicode.toString(), 'A🙂B');

  const bounded = new PieceTable('x', { maxHistory: 2 });
  bounded.insert(1, 'a');
  bounded.insert(2, 'b');
  bounded.insert(3, 'c');
  assert.equal(bounded.undo(), true);
  assert.equal(bounded.toString(), 'xab');
  assert.equal(bounded.undo(), true);
  assert.equal(bounded.toString(), 'xa');
  assert.equal(bounded.undo(), false);

  const noHistory = new PieceTable('x', { maxHistory: 0 });
  noHistory.insert(1, 'y');
  assert.equal(noHistory.undo(), false);
  assert.equal(noHistory.toString(), 'xy');
  assert.equal(editor.insert(editor.length, ''), false);
  assert.equal(editor.delete(2, 2), false);
  assert.equal(editor.replace(0, 1, editor.slice(0, 1)), false);
  assert.throws(() => editor.insert(-1, 'x'), RangeError);
  assert.throws(() => editor.delete(5, 2), RangeError);

  // Randomized model checking against ordinary immutable string operations.
  let seed = 271828;
  const random = max => {
    seed = (seed * 48271) % 2147483647;
    return seed % max;
  };
  for (let trial = 0; trial < 50; trial += 1) {
    let model = 'seed';
    const table = new PieceTable(model);
    const history = [];
    for (let step = 0; step < 80; step += 1) {
      const operation = random(3);
      if (operation === 0) {
        const at = random(model.length + 1);
        const text = ['a', 'XY', '🙂'][random(3)];
        history.push(model);
        model = model.slice(0, at) + text + model.slice(at);
        table.insert(at, text);
      } else if (operation === 1 && model.length > 0) {
        const start = random(model.length);
        const end = start + 1 + random(model.length - start);
        history.push(model);
        model = model.slice(0, start) + model.slice(end);
        table.delete(start, end);
      } else {
        const start = random(model.length + 1);
        const end = start + random(model.length - start + 1);
        const text = ['z', '', 'pq'][random(3)];
        if (model.slice(start, end) !== text) {
          history.push(model);
          model = model.slice(0, start) + text + model.slice(end);
        }
        table.replace(start, end, text);
      }
      assert.equal(table.toString(), model);
      table.assertValid();
    }
  }

  console.log('PieceTable: all tests passed');
}

if (require.main === module) runTests();

module.exports = { PieceTable };
