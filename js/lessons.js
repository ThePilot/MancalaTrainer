/*
 * Lesson content. Positions are written the way the board looks on screen:
 * pos(northRowLeftToRight [A..F], southRowLeftToRight [1..6], northStore, southStore)
 * Each step lists the accepted pits (0-based South index); tools/test.js
 * verifies those are the engine's best moves.
 */
(function () {
  function pos(n, s, ns, ss) {
    return s.concat([ss], n.slice().reverse(), [ns]);
  }
  window.LESSONS = [
    {
      id: 'rules',
      title: 'How the game works',
      body: [
        'You sit at the bottom (South). Your six pits are numbered <b>1–6</b> and your <b>store</b> is the big well on the right. Your opponent’s pits are <b>A–F</b>, and their store is on the left.',
        'On your turn, pick up <b>all</b> the stones from one of your pits and sow them one at a time, <b>counter-clockwise</b>: along your row to the right, into your store, then around through your opponent’s pits. You skip your opponent’s store.',
        'The game ends when either side’s six pits are all empty. Whoever still has stones on their side keeps them. Most stones wins — there are 48, so <b>25 wins</b>.'
      ],
      task: 'Click any of your pits to sow it and watch where the stones go.',
      board: pos([4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4], 0, 0),
      steps: [{ ok: [0, 1, 2, 3, 4, 5], any: true }],
      done: 'That’s sowing. Every stone that lands in your store is a point, banked forever.'
    },
    {
      id: 'free-turn',
      title: 'Free turns: count to your store',
      body: [
        'If your <b>last stone lands in your store</b>, you move again. This is the engine of good mancala: a free turn is a point <i>and</i> you keep the initiative.',
        'The trick is simple counting. Pit 6 is 1 step from your store, pit 5 is 2 steps, … pit 1 is 6 steps. <b>A pit whose stone count equals its distance to the store is a free turn.</b>'
      ],
      task: 'Exactly one of your pits earns a free turn here. Find it.',
      board: pos([4, 5, 3, 6, 4, 3], [5, 3, 5, 3, 4, 0], 2, 1),
      steps: [{ ok: [3], hint: 'Pit 4 is 3 steps from your store (pit 5, pit 6, store). Which pit has exactly as many stones as its distance?' }],
      done: 'Pit 4 holds 3 stones and sits 3 steps from the store. Scan for these every single turn.'
    },
    {
      id: 'chain',
      title: 'Chain them: rightmost first',
      body: [
        'Free turns chain. But sowing a pit drops a stone into every pit to its right — which can <b>break</b> a free turn that was waiting there.',
        'So when several free turns are available, <b>play the one closest to your store first</b>. It doesn’t disturb the others, and it empties itself so it can be refilled and fired again.'
      ],
      task: 'You can take five free turns in a row here. Start with the right pit.',
      board: pos([3, 2, 4, 1, 5, 3], [0, 0, 0, 3, 2, 1], 12, 12),
      steps: [
        { ok: [5], hint: 'Pits 4, 5 and 6 are all ready. Fire the one nearest your store first so you don’t spoil the others.' },
        { ok: [4], hint: 'Pit 6 is empty now. Pit 5 has 2 stones and is 2 steps away.' },
        { ok: [5], hint: 'Pit 5 just dropped a stone into pit 6 — it’s loaded again.' },
        { ok: [3], hint: 'Pit 4: 3 stones, 3 steps.' },
        { ok: [5], hint: 'Pit 6 has been reloaded one more time.' }
      ],
      done: 'Five free turns, five points, and it’s still your move. Stacking pits 4-5-6 as 3-2-1 is a pattern worth building toward.'
    },
    {
      id: 'capture',
      title: 'Captures: land in your own empty pit',
      body: [
        'If your last stone lands in an <b>empty pit on your side</b>, you capture that stone <b>plus everything in the opposite pit</b>. Captures are the biggest swings in the game.',
        'To find them: look for your empty pits, look at what sits across from each one, then ask “which of my pits has exactly enough stones to end there?”'
      ],
      task: 'Your opponent has piled up 8 stones in pit E. Take them.',
      board: pos([2, 4, 1, 1, 8, 3], [2, 3, 1, 0, 0, 6], 9, 8),
      steps: [{ ok: [1], hint: 'Your empty pit 5 sits under their big pile. Which pit ends exactly on pit 5?' }],
      done: 'Pit 2’s three stones end in empty pit 5, capturing the 8 opposite plus your own stone: 9 points in one move.'
    },
    {
      id: 'defend',
      title: 'Check their captures before you move',
      body: [
        'Your opponent can capture too. Before every move, do the same scan from their seat: <b>their empty pits, and whether any of their pits can reach one</b>.',
        'If one of your piles is under threat you can <b>move it</b>, <b>fill their empty pit</b> so the landing no longer captures, or change the stone count in the attacking pit so it overshoots.'
      ],
      task: 'Something of yours is about to be captured. Deal with it.',
      board: pos([2, 3, 3, 2, 0, 1], [1, 3, 2, 0, 8, 0], 12, 11),
      steps: [{ ok: [4], hint: 'Their pit E is empty and sits above your pit 5. Their pit F holds 1 stone… where does it land?' }],
      done: 'Their single stone in F was about to hop into empty E and take your 8. Sowing pit 5 moves the pile <i>and</i> drops a stone into E, so the threat is gone twice over.'
    },
    {
      id: 'opening',
      title: 'The opening everyone should know',
      body: [
        'Going first is an advantage, and the best first turn is well known. <b>Pit 3</b> has 4 stones and is 4 steps from your store — a free turn on move one.',
        'Then follow with <b>pit 6</b>: it banks another point and drops stones into your opponent’s nearest pits, which spoils <i>their</i> easy free turn in reply.'
      ],
      task: 'Play the two-move opening.',
      board: pos([4, 4, 4, 4, 4, 4], [4, 4, 4, 4, 4, 4], 0, 0),
      steps: [
        { ok: [2], hint: 'Which pit has 4 stones and is exactly 4 steps from your store?' },
        { ok: [5], hint: 'Now the pit right next to your store.' }
      ],
      done: '3 then 6: two points banked and the engine rates you ahead already. If you move second, expect this — and look for your own free turn in reply.'
    },
    {
      id: 'endgame',
      title: 'Endgame: stones on your side are yours',
      body: [
        'When one side runs out of stones the game ends, and <b>the other player keeps everything left on their own side</b>.',
        'So late in the game, count more than the stores. If your opponent is nearly out of moves, <b>keep your stones at home</b> — don’t sow big piles around the corner and hand them fresh stones to play with.'
      ],
      task: 'North has one stone left. Don’t give them any more.',
      board: pos([1, 0, 0, 0, 0, 0], [0, 0, 3, 0, 0, 8], 19, 17),
      steps: [{ ok: [2], hint: 'Pit 6 would spill six stones onto their side. Which move keeps everything at home?' }],
      done: 'After pit 3, North must play their last stone, their side is empty, and your 11 remaining stones are swept into your store: 28–20. Pit 6 would have thrown the game away.'
    }
  ];
  window.LESSON_POS = pos;
})();
