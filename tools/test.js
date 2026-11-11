// Sanity tests for the rules + engine. Run: node tools/test.js
const assert = require('assert');
const M = require('../js/engine.js')();

// --- rules ---
let r = M.play(M.newBoard(), 0, 2);
assert.deepStrictEqual(r.board, [4,4,0,5,5,5,1,4,4,4,4,4,4,0]);
assert(r.extra && r.next === 0);
r = M.play(M.newBoard(), 0, 5);
assert.deepStrictEqual(r.board, [4,4,4,4,4,0,1,5,5,5,4,4,4,0]);
assert(!r.extra && r.next === 1);
// capture
r = M.play([1,3,0,0,0,2,14,2,6,0,1,3,2,14], 0, 1);
assert.strictEqual(r.captured, 7); assert.strictEqual(r.board[6], 21);
assert.strictEqual(r.board[4], 0); assert.strictEqual(r.board[8], 0);
// no capture when opposite pit is empty
r = M.play([1,3,0,0,0,2,14,2,0,0,1,3,2,20], 0, 1);
assert.strictEqual(r.captured, 0); assert.strictEqual(r.board[4], 1);
// skip the opponent's store on a long sow; 13 stones laps and captures
r = M.play([0,0,0,0,0,13,10,1,1,1,1,1,1,18], 0, 5);
assert.strictEqual(r.board[13], 18);
assert.strictEqual(r.captured, 3);
// North moves and captures symmetrically
r = M.play([4,6,0,0,0,0,10,0,3,0,0,0,0,25], 1, 8);
assert.strictEqual(r.captured, 7); assert.strictEqual(r.board[13], 32);
// game end sweep
r = M.play([0,0,0,0,0,1,20,2,0,3,0,0,0,22], 0, 5);
assert(r.over); assert.strictEqual(r.board[6], 21); assert.strictEqual(r.board[13], 27);
assert.strictEqual(r.board.reduce((a, b) => a + b), 48);

// --- engine: hashed search agrees with itself across fresh runs & solved endgames ---
function rnd(seed) { let s = seed; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
const R = rnd(7);
let solvedCount = 0;
for (let g = 0; g < 40; g++) {
  let b = M.newBoard(), p = 0, over = false, ply = 0;
  while (!over) {
    const lm = M.legalMoves(b, p);
    const res = M.play(b, p, lm[Math.floor(R() * lm.length)]);
    b = res.board; over = res.over; p = res.next; ply++;
    assert.strictEqual(b.reduce((a, c) => a + c), 48);
    if (!over && M.sideCount(b, 0) + M.sideCount(b, 1) <= 10) {
      const a1 = M.analyze(b, p, { timeMs: 5000, fresh: true });
      if (!a1.solved) continue;
      solvedCount++;
      // exact value must equal brute-force minimax
      const bf = brute(b, p);
      assert.strictEqual(a1.moves[0].score, bf * M.UNIT + 0, 'solved score mismatch');
    }
  }
}
function brute(b, p) {
  let best = -99;
  for (const m of M.legalMoves(b, p)) {
    const r = M.play(b, p, m);
    let s;
    if (r.over) s = (r.board[M.STORE[p]] - r.board[M.STORE[1 - p]]);
    else s = r.next === p ? brute(r.board, p) : -brute(r.board, 1 - p);
    if (s > best) best = s;
  }
  return best;
}
assert(solvedCount > 20, 'expected to solve some endgames, got ' + solvedCount);

// --- content: lessons and puzzles are consistent with the engine ---
global.window = {};
require('../js/lessons.js'); require('../js/puzzles.js');
for (const L of window.LESSONS) {
  if (!L.board) continue;
  assert.strictEqual(L.board.reduce((a, c) => a + c), 48, L.id + ' stone count');
  let b = L.board;
  for (const step of L.steps) {
    const a = M.analyze(b, 0, { timeMs: 3000, maxDepth: 14, fresh: true });
    const best = a.moves[0];
    if (!step.any) {
      for (const mv of step.ok) {
        const sc = a.moves.find(x => x.move === mv);
        assert(sc && best.score - sc.score <= 2, `${L.id}: move ${mv} is not best (${JSON.stringify(a.moves)})`);
      }
    }
    b = M.play(b, 0, step.ok[0]).board;
  }
}
for (const P of window.PUZZLES) {
  assert.strictEqual(P.b.reduce((a, c) => a + c), 48);
  assert(M.legalMoves(P.b, 0).includes(P.sol));
}
console.log('all tests passed (' + solvedCount + ' endgames cross-checked, ' +
  window.LESSONS.length + ' lessons, ' + window.PUZZLES.length + ' puzzles)');
