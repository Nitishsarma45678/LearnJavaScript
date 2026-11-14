/**
 * Generic Minimax / Alpha-Beta Game Search
 * ----------------------------------------
 * A reusable adversarial search engine for deterministic, two-player,
 * zero-sum, perfect-information games.
 *
 * The game adapter supplies immutable state transitions and scores from the
 * selected root player's perspective. The engine adds:
 * - alpha-beta pruning
 * - iterative deepening with a node budget
 * - transposition-table bounds (exact / lower / upper)
 * - optional move ordering and preferred-move reuse
 *
 * Run: node alpha-beta-game-search.js
 */

'use strict';

const assert = require('node:assert/strict');

class SearchLimitReached extends Error {
  constructor() {
    super('search node budget exhausted');
    this.name = 'SearchLimitReached';
  }
}

function validateGame(game) {
  const required = [
    'currentPlayer',
    'generateMoves',
    'applyMove',
    'isMaximizing',
    'terminalScore',
    'evaluate',
    'key'
  ];
  for (const method of required) {
    if (!game || typeof game[method] !== 'function') {
      throw new TypeError('game adapter must implement ' + method + '()');
    }
  }
}

function finiteScore(value, source) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(source + ' must return a finite number');
  }
  return value;
}

function sameMove(first, second, game) {
  return typeof game.moveEquals === 'function'
    ? game.moveEquals(first, second)
    : Object.is(first, second);
}

function orderMoves(state, moves, preferredMove, rootPlayer, game) {
  let ordered = typeof game.orderMoves === 'function'
    ? game.orderMoves(state, moves.slice(), preferredMove, rootPlayer)
    : moves.slice();

  if (!Array.isArray(ordered)) {
    throw new TypeError('orderMoves must return an array');
  }

  if (preferredMove !== undefined) {
    const index = ordered.findIndex((move) => sameMove(move, preferredMove, game));
    if (index > 0) ordered.unshift(ordered.splice(index, 1)[0]);
  }
  return ordered;
}

function searchBestMove(initialState, game, options = {}) {
  validateGame(game);

  const maxDepth = options.maxDepth === undefined ? 6 : options.maxDepth;
  const nodeBudget = options.nodeBudget === undefined
    ? 100000
    : options.nodeBudget;
  const maxTableEntries = options.maxTableEntries === undefined
    ? 50000
    : options.maxTableEntries;

  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) {
    throw new RangeError('maxDepth must be a positive safe integer');
  }
  if (
    nodeBudget !== Infinity &&
    (!Number.isSafeInteger(nodeBudget) || nodeBudget < 1)
  ) {
    throw new RangeError('nodeBudget must be a positive integer or Infinity');
  }
  if (!Number.isSafeInteger(maxTableEntries) || maxTableEntries < 1) {
    throw new RangeError('maxTableEntries must be a positive safe integer');
  }

  const rootPlayer = options.rootPlayer === undefined
    ? game.currentPlayer(initialState)
    : options.rootPlayer;

  const context = {
    game,
    rootPlayer,
    table: new Map(),
    nodes: 0,
    nodeBudget,
    maxTableEntries
  };

  const terminal = game.terminalScore(initialState, rootPlayer);
  if (terminal !== null && terminal !== undefined) {
    return {
      move: null,
      score: finiteScore(terminal, 'terminalScore'),
      depth: 0,
      nodes: 0,
      complete: true
    };
  }

  const initialMoves = game.generateMoves(initialState);
  if (!Array.isArray(initialMoves)) {
    throw new TypeError('generateMoves must return an array');
  }
  if (initialMoves.length === 0) {
    return {
      move: null,
      score: finiteScore(game.evaluate(initialState, rootPlayer), 'evaluate'),
      depth: 0,
      nodes: 0,
      complete: true
    };
  }

  const rootMaximizes = Boolean(game.isMaximizing(initialState, rootPlayer));
  let completed = {
    move: initialMoves[0],
    score: finiteScore(game.evaluate(initialState, rootPlayer), 'evaluate'),
    depth: 0
  };
  let preferredMove;

  function visit(state, depth, alpha, beta) {
    context.nodes += 1;
    if (context.nodes > context.nodeBudget) throw new SearchLimitReached();

    const terminalScore = game.terminalScore(state, rootPlayer);
    if (terminalScore !== null && terminalScore !== undefined) {
      return finiteScore(terminalScore, 'terminalScore');
    }
    if (depth === 0) {
      return finiteScore(game.evaluate(state, rootPlayer), 'evaluate');
    }

    const key = game.key(state, rootPlayer);
    const alphaOriginal = alpha;
    const betaOriginal = beta;
    const cached = context.table.get(key);

    if (cached && cached.depth >= depth) {
      if (cached.bound === 'EXACT') return cached.score;
      if (cached.bound === 'LOWER') alpha = Math.max(alpha, cached.score);
      if (cached.bound === 'UPPER') beta = Math.min(beta, cached.score);
      if (alpha >= beta) return cached.score;
    }

    const moves = game.generateMoves(state);
    if (!Array.isArray(moves)) {
      throw new TypeError('generateMoves must return an array');
    }
    if (moves.length === 0) {
      return finiteScore(game.evaluate(state, rootPlayer), 'evaluate');
    }

    const maximizing = Boolean(game.isMaximizing(state, rootPlayer));
    const ordered = orderMoves(
      state,
      moves,
      cached ? cached.bestMove : undefined,
      rootPlayer,
      game
    );

    let bestScore = maximizing ? -Infinity : Infinity;
    let bestMove = ordered[0];

    for (const move of ordered) {
      const child = game.applyMove(state, move);
      const score = visit(child, depth - 1, alpha, beta);

      if (
        (maximizing && score > bestScore) ||
        (!maximizing && score < bestScore)
      ) {
        bestScore = score;
        bestMove = move;
      }

      if (maximizing) alpha = Math.max(alpha, bestScore);
      else beta = Math.min(beta, bestScore);
      if (alpha >= beta) break;
    }

    let bound = 'EXACT';
    if (bestScore <= alphaOriginal) bound = 'UPPER';
    else if (bestScore >= betaOriginal) bound = 'LOWER';

    if (!context.table.has(key) && context.table.size >= context.maxTableEntries) {
      const oldestKey = context.table.keys().next().value;
      context.table.delete(oldestKey);
    }
    context.table.set(key, { depth, score: bestScore, bound, bestMove });
    return bestScore;
  }

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    try {
      const moves = orderMoves(
        initialState,
        initialMoves,
        preferredMove,
        rootPlayer,
        game
      );
      let bestMove = moves[0];
      let bestScore = rootMaximizes ? -Infinity : Infinity;
      let alpha = -Infinity;
      let beta = Infinity;

      for (const move of moves) {
        const child = game.applyMove(initialState, move);
        const score = visit(child, depth - 1, alpha, beta);

        if (
          (rootMaximizes && score > bestScore) ||
          (!rootMaximizes && score < bestScore)
        ) {
          bestScore = score;
          bestMove = move;
        }

        if (rootMaximizes) alpha = Math.max(alpha, bestScore);
        else beta = Math.min(beta, bestScore);
        if (alpha >= beta) break;
      }

      completed = { move: bestMove, score: bestScore, depth };
      preferredMove = bestMove;
    } catch (error) {
      if (!(error instanceof SearchLimitReached)) throw error;
      break;
    }
  }

  return {
    ...completed,
    nodes: context.nodes,
    complete: completed.depth === maxDepth,
    tableEntries: context.table.size
  };
}

// ------------------------------ Example tests ------------------------------

function createTicTacToeAdapter() {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  function winner(board) {
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[b] === board[c]) {
        return board[a];
      }
    }
    return null;
  }

  function evaluate(state, rootPlayer) {
    const opponent = rootPlayer === 'X' ? 'O' : 'X';
    let score = 0;
    for (const line of lines) {
      const own = line.filter((index) => state.board[index] === rootPlayer).length;
      const other = line.filter((index) => state.board[index] === opponent).length;
      if (other === 0) score += [0, 1, 5, 100][own];
      if (own === 0) score -= [0, 1, 5, 100][other];
    }
    return score;
  }

  return {
    currentPlayer: (state) => state.turn,
    generateMoves: (state) => state.board
      .map((value, index) => value === null ? index : -1)
      .filter((index) => index >= 0),
    applyMove: (state, move) => {
      const board = state.board.slice();
      board[move] = state.turn;
      return { board, turn: state.turn === 'X' ? 'O' : 'X' };
    },
    isMaximizing: (state, rootPlayer) => state.turn === rootPlayer,
    terminalScore: (state, rootPlayer) => {
      const won = winner(state.board);
      if (won) return won === rootPlayer ? 100 : -100;
      if (state.board.every((cell) => cell !== null)) return 0;
      return null;
    },
    evaluate,
    key: (state, rootPlayer) => state.board.map((cell) => cell || '-').join('') +
      '|' + state.turn + '|' + rootPlayer,
    orderMoves: (state, moves) => {
      const priority = [4, 0, 2, 6, 8, 1, 3, 5, 7];
      return moves.sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
    }
  };
}

function runTests() {
  const game = createTicTacToeAdapter();
  const empty = { board: Array(9).fill(null), turn: 'X' };
  const opening = searchBestMove(empty, game, {
    maxDepth: 9,
    nodeBudget: 100000
  });
  assert.equal(opening.move, 4);
  assert.equal(opening.score, 0);
  assert.equal(opening.complete, true);

  const immediateWin = {
    board: ['X', 'X', null, 'O', 'O', null, null, null, null],
    turn: 'X'
  };
  assert.equal(searchBestMove(immediateWin, game, { maxDepth: 5 }).move, 2);

  const mustBlock = {
    board: ['O', 'O', null, 'X', null, null, null, 'X', null],
    turn: 'X'
  };
  assert.equal(searchBestMove(mustBlock, game, { maxDepth: 5 }).move, 2);

  const alreadyWon = {
    board: ['X', 'X', 'X', 'O', 'O', null, null, null, null],
    turn: 'O'
  };
  const terminalResult = searchBestMove(alreadyWon, game, { maxDepth: 4 });
  assert.equal(terminalResult.move, null);
  assert.equal(terminalResult.score, -100);

  const limited = searchBestMove(empty, game, {
    maxDepth: 20,
    nodeBudget: 10
  });
  assert.ok(limited.move !== null);
  assert.equal(limited.complete, false);
  assert.ok(limited.nodes > 0);

  assert.throws(() => searchBestMove(empty, game, { maxDepth: 0 }), RangeError);
  assert.throws(() => searchBestMove(empty, {}, {}), /must implement/);
  console.log('Alpha-beta game search: all tests passed');
}

if (require.main === module) runTests();

module.exports = {
  SearchLimitReached,
  searchBestMove,
  createTicTacToeAdapter
};
