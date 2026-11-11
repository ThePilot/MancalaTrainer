/*
 * Mancala (Kalah, 6 pits x 4 stones) rules + alpha-beta engine.
 *
 * Everything lives inside one self-contained factory function so the exact
 * same source can run on the page, inside a Blob-backed Web Worker (works
 * even from file://), and under Node for the tools/ scripts.
 *
 * Board layout (14 slots, sowing runs counter-clockwise = increasing index):
 *   0..5   South pits (player 0), left to right from South's seat
 *   6      South store
 *   7..12  North pits (player 1), 7 sits opposite 5, 12 sits opposite 0
 *   13     North store
 *
 * Scores are in quarter-stones (4 = one stone of final margin), always from
 * the point of view of the player to move.
 */
function MancalaFactory() {
  'use strict';

  var STORE = [6, 13];
  var UNIT = 4;
  var INF = 30000;

  function newBoard() {
    return [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
  }

  function legalMoves(b, p) {
    var o = p * 7, r = [];
    for (var i = 0; i < 6; i++) if (b[o + i] > 0) r.push(o + i);
    return r;
  }

  function sideCount(b, p) {
    var o = p * 7;
    return b[o] + b[o + 1] + b[o + 2] + b[o + 3] + b[o + 4] + b[o + 5];
  }

  /* Full-detail move for the UI: returns the new board plus what happened. */
  function play(b, p, pit) {
    var nb = b.slice();
    var n = nb[pit], i = pit, skip = STORE[1 - p], path = [];
    nb[pit] = 0;
    while (n > 0) {
      i = (i + 1) % 14;
      if (i === skip) continue;
      nb[i]++;
      path.push(i);
      n--;
    }
    var extra = i === STORE[p], captured = 0;
    if (!extra && i >= p * 7 && i < p * 7 + 6 && nb[i] === 1 && nb[12 - i] > 0) {
      captured = nb[12 - i] + 1;
      nb[STORE[p]] += captured;
      nb[i] = 0;
      nb[12 - i] = 0;
    }
    var over = false, sweep = [0, 0];
    if (sideCount(nb, 0) === 0 || sideCount(nb, 1) === 0) {
      over = true;
      for (var q = 0; q < 2; q++) {
        sweep[q] = sideCount(nb, q);
        nb[STORE[q]] += sweep[q];
        for (var k = 0; k < 6; k++) nb[q * 7 + k] = 0;
      }
    }
    return {
      board: nb, path: path, last: i, extra: extra && !over, landedInStore: extra,
      captured: captured, over: over, sweep: sweep,
      next: over ? -1 : (extra ? p : 1 - p)
    };
  }

  /* ---------- search ---------- */

  var MAX_PLY = 160;
  var stack = [];
  for (var s = 0; s < MAX_PLY + 2; s++) stack.push(new Int8Array(14));

  // Zobrist tables (deterministic LCG so results are reproducible).
  var z1 = new Int32Array(14 * 64), z2 = new Int32Array(14 * 64);
  (function () {
    var seed = 0x2545F491;
    function rnd() {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return seed | 0;
    }
    for (var i = 0; i < 14 * 64; i++) { z1[i] = rnd(); z2[i] = rnd(); }
  })();
  var SIDE1 = 0x5bd1e995 | 0, SIDE2 = 0x1b873593 | 0;

  var TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  var ttK1 = new Int32Array(TT_SIZE), ttK2 = new Int32Array(TT_SIZE);
  var ttScore = new Int16Array(TT_SIZE), ttDepth = new Int8Array(TT_SIZE);
  var ttFlag = new Uint8Array(TT_SIZE), ttMove = new Int8Array(TT_SIZE);
  var EXACT = 1, LOWER = 2, UPPER = 3, FULL = 4;

  function clearTT() { ttFlag.fill(0); }

  var nodes = 0, deadline = 0, horizon = false, sideWeight = 1;
  var TIMEOUT = { timeout: true };
  var now = (typeof performance !== 'undefined' && performance.now)
    ? function () { return performance.now(); }
    : function () { return Date.now(); };

  // Returns 0 = turn passes, 1 = extra turn, 2 = game over (stones swept).
  function doMove(src, dst, p, pit) {
    for (var c = 0; c < 14; c++) dst[c] = src[c];
    var n = dst[pit], i = pit, skip = p === 0 ? 13 : 6, own = p === 0 ? 6 : 13;
    dst[pit] = 0;
    while (n > 0) {
      i++; if (i === 14) i = 0;
      if (i === skip) continue;
      dst[i]++; n--;
    }
    var extra = i === own;
    if (!extra && dst[i] === 1 && dst[12 - i] > 0 &&
        (p === 0 ? i < 6 : (i > 6 && i < 13))) {
      dst[own] += dst[12 - i] + 1;
      dst[i] = 0; dst[12 - i] = 0;
    }
    var s0 = dst[0] + dst[1] + dst[2] + dst[3] + dst[4] + dst[5];
    var s1 = dst[7] + dst[8] + dst[9] + dst[10] + dst[11] + dst[12];
    if (s0 === 0 || s1 === 0) {
      dst[6] += s0; dst[13] += s1;
      dst[0] = dst[1] = dst[2] = dst[3] = dst[4] = dst[5] = 0;
      dst[7] = dst[8] = dst[9] = dst[10] = dst[11] = dst[12] = 0;
      return 2;
    }
    return extra ? 1 : 0;
  }

  function evaluate(b, p) {
    var d = UNIT * (b[6] - b[13]) + sideWeight *
      ((b[0] + b[1] + b[2] + b[3] + b[4] + b[5]) - (b[7] + b[8] + b[9] + b[10] + b[11] + b[12]));
    return p === 0 ? d : -d;
  }

  function search(ply, p, depth, alpha, beta) {
    var b = stack[ply];
    if (depth <= 0 || ply >= MAX_PLY) { horizon = true; return evaluate(b, p); }
    if ((++nodes & 4095) === 0 && now() > deadline) throw TIMEOUT;

    var h1 = p ? SIDE1 : 0, h2 = p ? SIDE2 : 0, i;
    for (i = 0; i < 14; i++) { h1 ^= z1[i * 64 + b[i]]; h2 ^= z2[i * 64 + b[i]]; }
    var slot = h1 & TT_MASK, ttm = -1, f = ttFlag[slot];
    if (f && ttK1[slot] === h1 && ttK2[slot] === h2) {
      ttm = ttMove[slot];
      var full = (f & FULL) !== 0;
      if (full || ttDepth[slot] >= depth) {
        var kind = f & 3, sc = ttScore[slot];
        if (kind === EXACT || (kind === LOWER && sc >= beta) || (kind === UPPER && sc <= alpha)) {
          if (!full) horizon = true;
          return sc;
        }
      }
    }

    var savedH = horizon;
    horizon = false;
    var best = -INF, bestMove = -1, a0 = alpha, o = p * 7, child = stack[ply + 1];
    // Try the hash move first, then pits nearest the store (free turns live there).
    for (var k = -1; k < 6; k++) {
      var pit;
      if (k === -1) { if (ttm < 0) continue; pit = ttm; }
      else { pit = o + 5 - k; if (pit === ttm) continue; }
      if (b[pit] === 0) continue;
      var code = doMove(b, child, p, pit), sc2;
      if (code === 2) sc2 = UNIT * (p === 0 ? child[6] - child[13] : child[13] - child[6]);
      else if (code === 1) sc2 = search(ply + 1, p, depth, alpha, beta);
      else sc2 = -search(ply + 1, 1 - p, depth - 1, -beta, -alpha);
      if (sc2 > best) { best = sc2; bestMove = pit; }
      if (sc2 > alpha) alpha = sc2;
      if (alpha >= beta) break;
    }
    var sub = horizon;
    ttK1[slot] = h1; ttK2[slot] = h2; ttScore[slot] = best; ttDepth[slot] = depth;
    ttMove[slot] = bestMove;
    ttFlag[slot] = (best <= a0 ? UPPER : best >= beta ? LOWER : EXACT) | (sub ? 0 : FULL);
    horizon = savedH || sub;
    return best;
  }

  /*
   * Score every legal move for `player` with iterative deepening.
   * opts: { timeMs (default 500), maxDepth (default 40), fresh (clear hash) }
   * Returns { moves: [{move, score, exact}] best-first, depth, solved, nodes }.
   */
  function analyze(board, player, opts) {
    opts = opts || {};
    var timeMs = opts.timeMs == null ? 500 : opts.timeMs;
    var maxDepth = opts.maxDepth || 40;
    sideWeight = opts.sideWeight == null ? 1 : opts.sideWeight;
    if (opts.fresh) clearTT();
    var root = stack[0], i;
    for (i = 0; i < 14; i++) root[i] = board[i];
    var legal = legalMoves(board, player);
    var res = legal.map(function (m) { return { move: m, score: 0, exact: false }; });
    if (!legal.length) return { moves: [], depth: 0, solved: true, nodes: 0 };
    var start = now(), depthDone = 0, solved = false;
    nodes = 0;
    for (var d = 1; d <= maxDepth; d++) {
      deadline = d === 1 ? Infinity : start + timeMs;
      var tmp = [], allExact = true;
      try {
        for (i = 0; i < res.length; i++) {
          var m = res[i].move, sc;
          horizon = false;
          var code = doMove(root, stack[1], player, m);
          if (code === 2) sc = UNIT * (player === 0 ? stack[1][6] - stack[1][13] : stack[1][13] - stack[1][6]);
          else if (code === 1) sc = search(1, player, d, -INF, INF);
          else sc = -search(1, 1 - player, d - 1, -INF, INF);
          tmp.push({ move: m, score: sc + 0, exact: !horizon }); // + 0 turns -0 into 0
          if (horizon) allExact = false;
        }
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break;
      }
      tmp.sort(function (a, b) { return b.score - a.score; });
      res = tmp;
      depthDone = d;
      if (allExact) { solved = true; break; }
      if (now() - start > timeMs * 0.6) break; // next depth would not finish
    }
    return { moves: res, depth: depthDone, solved: solved, nodes: nodes };
  }

  return {
    UNIT: UNIT, STORE: STORE,
    newBoard: newBoard, legalMoves: legalMoves, sideCount: sideCount,
    play: play, analyze: analyze, clearTT: clearTT
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = MancalaFactory;
