(function () {
  'use strict';

  var M = MancalaFactory();
  var U = M.UNIT;
  var $ = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var pitName = function (i) { return i < 6 ? String(i + 1) : 'ABCDEF'[12 - i]; };
  var fmt = function (x) {
    var r = Math.round(Math.abs(x) * 2) / 2;
    return r % 1 ? r.toFixed(1) : String(r);
  };
  var stones = function (x) { return fmt(x) + (fmt(x) === '1' ? ' stone' : ' stones'); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  /* ---------- saved progress ---------- */
  var KEY = 'mancala-trainer-v1';
  var saved = { games: {}, puzzles: {}, lessons: {}, level: 1, first: 0 };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') for (var k in saved) if (raw[k] != null) saved[k] = raw[k];
  } catch (e) { /* private mode etc: just don't persist */ }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ } }

  /* ---------- engine in a worker (falls back to the main thread) ---------- */
  var engine = (function () {
    var worker = null, pending = {}, nextId = 0;
    function local(req) { return M.analyze(req.board, req.player, req.opts); }
    function failover() {
      worker = null;
      var old = pending; pending = {};
      Object.keys(old).forEach(function (id) { old[id].resolve(local(old[id].req)); });
    }
    try {
      var src = MancalaFactory.toString() + '\nvar M=MancalaFactory();onmessage=function(e){var d=e.data;' +
        'postMessage({id:d.id,result:M.analyze(d.board,d.player,d.opts)});};';
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = function (e) {
        var p = pending[e.data.id];
        if (p) { delete pending[e.data.id]; p.resolve(e.data.result); }
      };
      worker.onerror = failover;
    } catch (e) { worker = null; }
    return {
      analyze: function (board, player, opts) {
        var req = { board: Array.prototype.slice.call(board), player: player, opts: opts || {} };
        return new Promise(function (resolve) {
          if (!worker) { setTimeout(function () { resolve(local(req)); }, 0); return; }
          req.id = ++nextId;
          pending[req.id] = { resolve: resolve, req: req };
          worker.postMessage(req);
        });
      }
    };
  })();

  /* ---------- board view ---------- */
  var GOLDEN = 2.39996323;
  function BoardView(root, onPit, names) {
    this.cells = [];
    this.counts = [];
    var self = this;
    var board = document.createElement('div');
    board.className = 'board';
    function store(i, who) {
      var el = document.createElement('div');
      el.className = 'store ' + (i === 13 ? 'store-n' : 'store-s');
      el.innerHTML = '<div class="who">' + esc(who) + '</div><div class="well"><div class="stones"></div></div><div class="count">0</div>';
      self.cells[i] = el;
      return el;
    }
    function pit(i) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML = '<div class="lab"><span class="name">' + pitName(i) + '</span><span class="val"></span></div>' +
        '<button type="button" class="pit"><span class="stones"></span><span class="count">0</span></button>';
      var btn = cell.querySelector('.pit');
      btn.setAttribute('aria-label', (i < 6 ? 'Your pit ' : 'Opponent pit ') + pitName(i));
      if (i < 6) btn.addEventListener('click', function () { onPit(i); });
      else btn.tabIndex = -1;
      self.cells[i] = cell;
      return cell;
    }
    var rows = document.createElement('div');
    rows.className = 'rows';
    var rn = document.createElement('div'); rn.className = 'row row-n';
    var rs = document.createElement('div'); rs.className = 'row row-s';
    var i;
    for (i = 12; i >= 7; i--) rn.appendChild(pit(i));
    for (i = 0; i < 6; i++) rs.appendChild(pit(i));
    rows.appendChild(rn); rows.appendChild(rs);
    board.appendChild(store(13, names[1]));
    board.appendChild(rows);
    board.appendChild(store(6, names[0]));
    root.appendChild(board);
  }

  BoardView.prototype.setStones = function (i, n) {
    var cell = this.cells[i], box = cell.querySelector('.stones');
    var isStore = i === 6 || i === 13, cap = isStore ? 30 : 13, max = isStore ? 48 : 20;
    var want = Math.min(n, max), have = box.childElementCount;
    while (have > want) { box.removeChild(box.lastChild); have--; }
    while (have < want) {
      var r = Math.min(1, Math.sqrt((have + 0.5) / cap)), t = have * GOLDEN + i;
      var st = document.createElement('i');
      st.className = 'st c' + ((have * 3 + i * 2) % 5);
      st.style.left = (50 + 34 * r * Math.cos(t)).toFixed(1) + '%';
      st.style.top = (50 + 34 * r * Math.sin(t)).toFixed(1) + '%';
      box.appendChild(st);
      have++;
    }
    cell.querySelector('.count').textContent = n;
  };

  /* o: { clickable:[idx], hint:idx, pulse:idx, cap:[idx], vals:{idx:{text,cls}}, last:idx } */
  BoardView.prototype.render = function (b, o) {
    o = o || {};
    for (var i = 0; i < 14; i++) {
      this.setStones(i, b[i]);
      var cell = this.cells[i];
      cell.classList.toggle('pulse', o.pulse === i);
      cell.classList.toggle('cap', !!o.cap && o.cap.indexOf(i) >= 0);
      if (i === 6 || i === 13) continue;
      var can = !!o.clickable && o.clickable.indexOf(i) >= 0;
      var btn = cell.querySelector('.pit');
      cell.classList.toggle('clickable', can);
      cell.classList.toggle('hint', o.hint === i);
      cell.classList.toggle('last', o.last === i);
      if (i < 6) btn.disabled = !can;
      var v = o.vals && o.vals[i], val = cell.querySelector('.val');
      val.textContent = v ? v.text : '';
      val.className = 'val' + (v && v.cls ? ' ' + v.cls : '');
    }
  };

  /* Sow stone by stone. Resolves with the M.play result, or null if cancelled. */
  BoardView.prototype.animate = async function (board, player, pit, alive) {
    var r = M.play(board, player, pit);
    var cur = Array.prototype.slice.call(board), n = cur[pit], i;
    cur[pit] = 0;
    this.render(cur, { pulse: pit });
    await sleep(220); if (!alive()) return null;
    var step = Math.max(70, Math.min(190, 1500 / n));
    for (i = 0; i < r.path.length; i++) {
      cur[r.path[i]]++;
      this.render(cur, { pulse: r.path[i] });
      await sleep(step); if (!alive()) return null;
    }
    if (r.captured) {
      this.render(cur, { cap: [r.last, 12 - r.last] });
      await sleep(560); if (!alive()) return null;
      cur[r.last] = 0; cur[12 - r.last] = 0; cur[M.STORE[player]] += r.captured;
      this.render(cur, { pulse: M.STORE[player] });
      await sleep(380); if (!alive()) return null;
    }
    if (r.over && (r.sweep[0] || r.sweep[1])) {
      await sleep(450); if (!alive()) return null;
      this.render(r.board, { pulse: r.sweep[0] ? 6 : 13 });
      await sleep(400); if (!alive()) return null;
    }
    this.render(r.board, { last: pit });
    return r;
  };

  /* ---------- move explanations ---------- */
  function bestCapture(b, p) {
    var best = null;
    M.legalMoves(b, p).forEach(function (m) {
      var r = M.play(b, p, m);
      if (r.captured && (!best || r.captured > best.n)) best = { n: r.captured, from: m, target: 12 - r.last };
    });
    return best;
  }
  function features(b, pit) {
    var r = M.play(b, 0, pit);
    return { r: r, threat: (r.over || r.extra) ? null : bestCapture(r.board, 1) };
  }
  function didWhat(f) {
    if (f.r.over) return 'ended the game';
    if (f.r.extra) return 'landed in your store for a free turn';
    if (f.r.captured) return 'captured ' + f.r.captured + ' stones';
    return 'was a quiet move';
  }
  function whyGood(b, pit, f, playedPit, fPlayed) {
    if (f.r.over) return 'it ends the game on the spot with the stones counted your way';
    if (f.r.extra) {
      if (fPlayed && fPlayed.r.extra && pit > playedPit) return 'it takes the free turn nearest your store first, which keeps your other pits lined up';
      return 'it lands exactly in your store, so you move again';
    }
    if (f.r.captured) return 'it captures ' + f.r.captured + ' stones';
    var before = bestCapture(b, 1);
    if (before && before.n >= 3 && (!f.threat || f.threat.n < before.n)) {
      return 'it deals with the threat to your pit ' + pitName(before.target) +
        ' (their pit ' + pitName(before.from) + ' was lined up to capture ' + before.n + ')';
    }
    return 'it gives the opponent less to work with over the next few turns';
  }
  function threatNote(fPlayed, fBest) {
    var t = fPlayed.threat;
    if (t && t.n >= 3 && (!fBest || !fBest.threat || fBest.threat.n < t.n)) {
      return ' It also leaves your pit ' + pitName(t.target) + ' exposed: they can capture ' + t.n +
        ' by playing ' + pitName(t.from) + '.';
    }
    return '';
  }
  var GRADES = {
    best: 'Best move', good: 'Good move', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder'
  };
  function gradeMove(before, pit, a) {
    var best = a.moves[0], mine = null;
    a.moves.forEach(function (m) { if (m.move === pit) mine = m; });
    var loss = Math.max(0, (best.score - mine.score) / U);
    var fp = features(before, pit), text, g;
    if (a.moves.length === 1) {
      g = 'best'; text = 'Pit ' + pitName(pit) + ' was your only legal move.';
    } else if (loss < 0.01) {
      g = 'best';
      text = 'Pit ' + pitName(pit) + ' ' + didWhat(fp) + (fp.r.extra || fp.r.captured || fp.r.over
        ? ' — exactly what the engine would play.'
        : '. Nothing flashy was available and this was the most solid choice.');
    } else {
      g = loss < 1 ? 'good' : loss < 2.5 ? 'inaccuracy' : loss < 5 ? 'mistake' : 'blunder';
      var fb = features(before, best.move);
      text = 'Pit ' + pitName(pit) + ' ' + didWhat(fp) + '. Pit ' + pitName(best.move) +
        ' was ' + (g === 'good' ? 'slightly ' : '') + 'stronger: ' + whyGood(before, best.move, fb, pit, fp) + '.' +
        threatNote(fp, fb) + ' Cost: about ' + stones(loss) + '.';
    }
    return { g: g, loss: loss, best: best.move, text: text };
  }
  function hintText(b, a) {
    var f = features(b, a.moves[0].move);
    if (a.moves.length === 1) return 'You only have one legal move.';
    if (f.r.extra) return 'You have a free turn available. Compare each pit’s stone count with its distance to your store.';
    if (f.r.captured) return 'There’s a capture on the board. Check your empty pits and what sits across from them.';
    var before = bestCapture(b, 1);
    if (before && before.n >= 3 && (!f.threat || f.threat.n < before.n)) return 'One of your pits is in danger. Look at their empty pits and what can reach them.';
    return 'No immediate tactics. Look for the move that doesn’t hand over a free turn or a capture.';
  }

  /* =====================================================================
   * PLAY
   * ===================================================================== */
  var LEVELS = [
    { name: 'Beginner', depth: 1, random: 0.4 },
    { name: 'Casual', depth: 3, random: 0.12 },
    { name: 'Tough', depth: 7, random: 0 },
    { name: 'Expert', depth: 40, time: 1000, random: 0 }
  ];
  /* The first two moves are settled theory (3, then 6); a sub-second search can
     wobble between them, so pin those so the coach agrees with the lesson. */
  var BOOK = { '4,4,4,4,4,4,0,4,4,4,4,4,4,0': 2, '4,4,0,5,5,5,1,4,4,4,4,4,4,0': 5 };
  function withBook(board, a) {
    var pit = BOOK[board.join(',')], k = -1;
    if (pit == null) return a;
    a.moves.forEach(function (m, i) { if (m.move === pit) k = i; });
    if (k > 0) {
      var top = a.moves[0].score, m = a.moves.splice(k, 1)[0];
      a.moves[0].score = m.score; m.score = top;
      a.moves.unshift(m);
      a.moves.sort(function (x, y) { return y.score - x.score; });
    }
    return a;
  }
  var playView = new BoardView($('play-board'), userMove, ['You', 'CPU']);
  var G = null, token = 0;

  $('level').value = String(saved.level);
  $('first').value = String(saved.first);

  function newGame() {
    token++;
    saved.level = +$('level').value; saved.first = +$('first').value; save();
    G = {
      board: M.newBoard(), turn: saved.first, level: saved.level, over: false, busy: false,
      log: [], snaps: [], pending: [], analysis: null, lastA: null, evalS: null, solved: false,
      hintLevel: 0, hintPit: -1, recorded: false, shown: null
    };
    setCoach('<p class="muted">Make a move and I’ll grade it against the engine: what it did, what was better, and why. ' +
      'Stuck? <b>Hint</b> nudges you first and shows the move on a second press.</p>');
    startTurn();
  }

  function setCoach(html) { $('coach').innerHTML = html; }

  function showGrade(entry) {
    if (!entry.grade) return;
    G.shown = entry;
    var gr = entry.grade;
    setCoach('<div class="grade g-' + gr.g + '"><span class="badge">' + GRADES[gr.g] + '</span>' +
      '<span class="muted">move ' + entry.n + (entry.hint ? ' · hint used' : '') + '</span></div><p>' + esc(gr.text) + '</p>');
    renderLog();
  }

  function renderPlay() {
    if (!G) return;
    var yours = G.turn === 0 && !G.over && !G.busy;
    var o = { clickable: yours ? M.legalMoves(G.board, 0) : [] };
    if (yours && G.hintPit >= 0) o.hint = G.hintPit;
    if (G.lastPit != null) o.last = G.lastPit;
    if (yours && $('xray').checked && G.lastA) {
      o.vals = {};
      var top = G.lastA.moves[0].score;
      G.lastA.moves.forEach(function (m) {
        var v = m.score / U;
        o.vals[m.move] = { text: (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(v), cls: m.score === top ? 'topv' : '' };
      });
    }
    playView.render(G.board, o);
    renderStatus();
    renderEval();
    $('undo').disabled = !G.snaps.length;
    $('hint').disabled = !yours;
  }

  function describeCpu() {
    var parts = [];
    for (var i = G.log.length - 1; i >= 0 && G.log[i].by === 1; i--) {
      var e = G.log[i];
      parts.unshift(pitName(e.pit) + (e.captured ? ' (captured ' + e.captured + ')' : e.extra ? ' (free turn)' : ''));
    }
    return parts.length ? 'Computer played ' + parts.join(', then ') + '. ' : '';
  }

  function renderStatus() {
    var el = $('play-status'), s = G.board[6], n = G.board[13];
    if (G.over) {
      el.innerHTML = s > n ? '<b>You win ' + s + '–' + n + '.</b>' : s < n ? '<b>Computer wins ' + n + '–' + s + '.</b>' : '<b>Draw, ' + s + '–' + n + '.</b>';
    } else if (G.turn === 1) {
      el.textContent = 'Computer is thinking…';
    } else {
      var last = G.log[G.log.length - 1];
      el.innerHTML = esc(describeCpu()) + (last && last.by === 0 ? '<b>Free turn — move again.</b>' : '<b>Your move.</b>');
    }
  }

  function renderEval() {
    var fill = $('evalbar-fill'), label = $('evalbar-label'), v;
    if (G.over) v = G.board[6] - G.board[13]; else v = G.evalS;
    if (v == null) { fill.style.width = '50%'; label.textContent = 'Engine estimate appears on your turn'; return; }
    fill.style.width = (50 + Math.max(-12, Math.min(12, v)) / 12 * 50) + '%';
    var who = v > 0.2 ? 'you by ' + fmt(v) : v < -0.2 ? 'computer by ' + fmt(v) : 'dead even';
    label.textContent = G.over ? 'Final margin: ' + who
      : (G.solved ? 'Solved to the end: ' : 'Engine expects: ') + who;
  }

  function renderLog() {
    var el = $('movelog');
    if (!G.log.length) { el.innerHTML = '<span class="muted">No moves yet.</span>'; }
    else {
      el.innerHTML = G.log.map(function (e, i) {
        var cls = 'chip ' + (e.by === 0 ? 'you' : 'cpu');
        if (e.grade) cls += ' g-' + e.grade.g;
        if (G.shown === e) cls += ' sel';
        var tip = (e.by === 0 ? 'You' : 'Computer') + ': pit ' + pitName(e.pit) + (e.grade ? ' — ' + GRADES[e.grade.g] : '');
        return '<button type="button" class="' + cls + '" data-i="' + i + '" title="' + esc(tip) + '"' +
          (e.by === 1 ? ' disabled' : '') + '>' + pitName(e.pit) + '</button>';
      }).join('');
      el.scrollTop = el.scrollHeight;
    }
    var rec = saved.games[G.level] || { w: 0, l: 0, d: 0 };
    $('record').textContent = 'Your record vs ' + LEVELS[G.level].name + ': ' + rec.w + ' won · ' + rec.l + ' lost · ' + rec.d + ' drawn';
  }
  $('movelog').addEventListener('click', function (ev) {
    var b = ev.target.closest('.chip');
    if (b && G.log[+b.dataset.i]) showGrade(G.log[+b.dataset.i]);
  });

  async function startTurn() {
    var t = token;
    G.hintLevel = 0; G.hintPit = -1; G.lastA = null;
    if (G.over) { G.busy = false; renderPlay(); renderLog(); finish(); return; }
    if (G.turn === 0) {
      G.busy = false;
      var board = G.board;
      G.analysis = engine.analyze(board, 0, { timeMs: 700 });
      renderPlay(); renderLog();
      G.analysis = G.analysis.then(function (res) { return withBook(board, res); });
      var a = await G.analysis;
      if (t !== token || G.board !== board) return;
      G.lastA = a; G.evalS = a.moves[0].score / U; G.solved = a.solved;
      renderPlay();
    } else {
      G.busy = true;
      renderPlay(); renderLog();
      var L = LEVELS[G.level];
      var both = await Promise.all([
        engine.analyze(G.board, 1, { timeMs: L.time || 1e9, maxDepth: L.depth }), sleep(600)
      ]);
      if (t !== token) return;
      var moves = both[0].moves, mv;
      if (Math.random() < L.random) mv = moves[Math.floor(Math.random() * moves.length)].move;
      else {
        var tops = moves.filter(function (m) { return m.score === moves[0].score; });
        mv = tops[Math.floor(Math.random() * tops.length)].move;
      }
      var r = await playView.animate(G.board, 1, mv, function () { return t === token; });
      if (!r) return;
      G.log.push({ by: 1, pit: mv, extra: r.extra, captured: r.captured });
      G.board = r.board; G.turn = r.next; G.over = r.over; G.lastPit = mv;
      startTurn();
    }
  }

  async function userMove(pit) {
    if (!G || G.over || G.turn !== 0 || G.busy || !G.board[pit]) return;
    var t = token, before = G.board, analysis = G.analysis;
    G.busy = true;
    G.snaps.push({ board: before, logLen: G.log.length, evalS: G.evalS, lastPit: G.lastPit });
    var entry = { by: 0, pit: pit, hint: G.hintLevel > 0, snap: G.snaps.length - 1 };
    entry.n = G.log.filter(function (e) { return e.by === 0; }).length + 1;
    $('undo').disabled = true; $('hint').disabled = true;
    var r = await playView.animate(before, 0, pit, function () { return t === token; });
    if (!r) return;
    entry.extra = r.extra; entry.captured = r.captured;
    G.log.push(entry);
    G.board = r.board; G.turn = r.next; G.over = r.over; G.lastPit = pit;
    G.pending.push(analysis.then(function (a) {
      if (t !== token) return;
      entry.grade = gradeMove(before, pit, a);
      showGrade(entry);
    }));
    startTurn();
  }

  function undoTo(k) {
    if (!G || !G.snaps.length) return;
    if (k == null) k = G.snaps.length - 1;
    var s = G.snaps[k];
    token++;
    G.snaps.length = k; G.log.length = s.logLen; G.pending = [];
    G.board = s.board; G.turn = 0; G.over = false; G.evalS = s.evalS; G.lastPit = s.lastPit; G.shown = null;
    setCoach('<p class="muted">Move taken back. Have another look at the position.</p>');
    startTurn();
  }

  async function finish() {
    var t = token;
    await Promise.all(G.pending);
    if (t !== token) return;
    var s = G.board[6], n = G.board[13];
    if (!G.recorded) {
      G.recorded = true;
      var rec = saved.games[G.level] || (saved.games[G.level] = { w: 0, l: 0, d: 0 });
      rec[s > n ? 'w' : s < n ? 'l' : 'd']++;
      save();
    }
    var mine = G.log.filter(function (e) { return e.by === 0 && e.grade; });
    var counts = { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }, total = 0, worst = null;
    mine.forEach(function (e) {
      counts[e.grade.g]++; total += e.grade.loss;
      if (!worst || e.grade.loss > worst.grade.loss) worst = e;
    });
    var html = '<div class="grade"><span class="badge end">' + (s > n ? 'You won ' + s + '–' + n : s < n ? 'You lost ' + s + '–' + n : 'Draw ' + s + '–' + n) + '</span></div>';
    if (mine.length) {
      html += '<p>' + mine.length + ' moves, giving up about <b>' + stones(total) + '</b> in total versus perfect play (' +
        fmt(total / mine.length) + ' per move).</p><div class="tally">' +
        Object.keys(counts).map(function (g) {
          return '<span class="g-' + g + '"><span class="dot"></span>' + counts[g] + ' ' + GRADES[g].replace(' move', '').toLowerCase() + '</span>';
        }).join('') + '</div>';
      if (worst && worst.grade.loss >= 1) {
        html += '<p>Your costliest moment was move ' + worst.n + ' (pit ' + pitName(worst.pit) + ', about ' + stones(worst.grade.loss) +
          '). Tap any of your moves in the list to review it.</p>' +
          '<button type="button" class="btn" id="retry">Replay from move ' + worst.n + '</button> ';
      } else {
        html += '<p>No real mistakes. Try a stronger opponent.</p>';
      }
    }
    html += '<button type="button" class="btn primary" id="again">New game</button>';
    G.shown = null;
    setCoach(html);
    renderLog();
    $('again').addEventListener('click', newGame);
    if ($('retry')) $('retry').addEventListener('click', function () { undoTo(worst.snap); });
  }

  $('new-game').addEventListener('click', newGame);
  $('undo').addEventListener('click', function () { undoTo(); });
  $('xray').addEventListener('change', renderPlay);
  $('hint').addEventListener('click', async function () {
    if (!G || G.turn !== 0 || G.busy || G.over) return;
    var t = token, board = G.board, a = await G.analysis;
    if (t !== token || G.board !== board || G.busy) return;
    G.hintLevel++;
    if (G.hintLevel === 1) {
      setCoach('<div class="grade"><span class="badge hintb">Hint</span></div><p>' + esc(hintText(board, a)) +
        '</p><p class="muted">Press Hint again to see the move.</p>');
    } else {
      G.hintPit = a.moves[0].move;
      setCoach('<div class="grade"><span class="badge hintb">Hint</span></div><p>The engine likes pit <b>' +
        pitName(G.hintPit) + '</b>. Before you play it, work out why.</p>');
      renderPlay();
    }
  });

  /* =====================================================================
   * DRILLS (shared by puzzles and lessons)
   * ===================================================================== */
  function Drill(view, hooks) {
    this.view = view; this.hooks = hooks; this.tok = 0;
  }
  /* def: { board, steps:[{ok,hint,any}], live } */
  Drill.prototype.load = function (def) {
    this.tok++;
    this.def = def; this.board = def.board.slice(); this.idx = 0;
    this.busy = false; this.solved = false; this.firstTry = true; this.hintPit = -1;
    this.begin();
  };
  Drill.prototype.begin = function () {
    this.analysis = this.def.live ? engine.analyze(this.board, 0, { timeMs: 500 }) : null;
    this.render();
  };
  Drill.prototype.render = function () {
    var o = { clickable: (this.solved || this.busy) ? [] : M.legalMoves(this.board, 0) };
    if (this.hintPit >= 0 && !this.solved) o.hint = this.hintPit;
    this.view.render(this.board, o);
  };
  Drill.prototype.click = async function (pit) {
    if (this.busy || this.solved || !this.board[pit]) return;
    var self = this, t = this.tok, step = this.def.steps[this.idx], a = null, okSet;
    this.busy = true; this.hintPit = -1;
    this.render();
    if (this.analysis) { a = await this.analysis; if (t !== this.tok) return; }
    if (step) okSet = step.ok;
    else okSet = a.moves.filter(function (m) { return a.moves[0].score - m.score <= 3; }).map(function (m) { return m.move; });
    var before = this.board;
    var r = await this.view.animate(before, 0, pit, function () { return t === self.tok; });
    if (!r) return;
    if (okSet.indexOf(pit) >= 0) {
      this.board = r.board; this.idx++;
      var more = !r.over && (this.def.live ? r.extra : this.idx < this.def.steps.length);
      if (more) { this.busy = false; this.begin(); this.hooks.onStep(this); }
      else { this.solved = true; this.render(); this.hooks.onSolved(this); }
    } else {
      this.firstTry = false;
      this.hooks.onWrong(this, pit, a, step, before);
      await sleep(1300); if (t !== this.tok) return;
      this.busy = false; this.render();
    }
  };
  Drill.prototype.showAnswer = async function () {
    if (this.solved || this.busy) return false;
    var t = this.tok, step = this.def.steps[this.idx], pit;
    this.firstTry = false;
    if (step) pit = step.ok[0];
    else { var a = await this.analysis; if (t !== this.tok || this.busy) return false; pit = a.moves[0].move; }
    this.hintPit = pit; this.render();
    return true;
  };

  /* =====================================================================
   * PUZZLES
   * ===================================================================== */
  var PUZZLES = window.PUZZLES || [];
  var THEMES = {
    free: ['Free turn', 'There’s a free turn here. Count stones against distance to your store.'],
    capture: ['Capture', 'There’s a capture. Look at your empty pits and what sits across from them.'],
    combo: ['Combination', 'Take a free turn first, then something bigger.'],
    defend: ['Defence', 'You’re under threat. Work out what they are about to capture.'],
    quiet: ['Quiet move', 'No fireworks. Find the move that spoils their best idea.']
  };
  var pIdx = 0;
  var puzzleDrill = new Drill(null, {
    onStep: function () { $('puzzle-msg').innerHTML = '<b class="ok">Right.</b> You have a free turn — finish the job.'; },
    onWrong: function (d, pit, a) {
      var txt = 'Pit ' + pitName(pit) + ' isn’t the one.';
      if (a) {
        var mine = null; a.moves.forEach(function (m) { if (m.move === pit) mine = m; });
        var loss = (a.moves[0].score - mine.score) / U;
        if (loss >= 0.5) txt += ' It comes out about ' + stones(loss) + ' worse than the best move.';
      }
      $('puzzle-msg').innerHTML = '<b class="bad">Not quite.</b> ' + esc(txt) + ' Have another go.';
    },
    onSolved: function (d) {
      var P = PUZZLES[pIdx], f = features(P.b, P.sol);
      if (saved.puzzles[P.id] !== 'ok') { saved.puzzles[P.id] = d.firstTry ? 'ok' : 'help'; save(); }
      $('puzzle-msg').innerHTML = '<b class="ok">' + (d.firstTry ? 'Solved first try.' : 'Solved.') + '</b> ' +
        '<span class="tag">' + THEMES[P.theme][0] + '</span> Pit ' + pitName(P.sol) + ' ' + esc(didWhat(f)) +
        (P.theme === 'defend' ? ' that took the sting out of their capture threat' : '') +
        '. Every other first move ends up at least ' + stones(P.gap) + ' worse.';
      renderPuzzleChrome();
    }
  });
  puzzleDrill.view = new BoardView($('puzzle-board'), function (p) { puzzleDrill.click(p); }, ['You', 'Them']);

  function loadPuzzle(i) {
    if (!PUZZLES.length) { $('puzzle-status').textContent = 'No puzzles found.'; return; }
    pIdx = (i + PUZZLES.length) % PUZZLES.length;
    var P = PUZZLES[pIdx];
    puzzleDrill.load({ board: P.b, steps: [{ ok: [P.sol] }], live: true });
    $('puzzle-msg').innerHTML = 'One move here is clearly better than the rest. Click the pit you would play.';
    renderPuzzleChrome();
  }
  function renderPuzzleChrome() {
    var done = 0;
    $('puzzle-status').innerHTML = '<b>Puzzle ' + (pIdx + 1) + ' of ' + PUZZLES.length + '.</b> You to move — find the best move.';
    $('puzzle-grid').innerHTML = PUZZLES.map(function (P, i) {
      var st = saved.puzzles[P.id];
      if (st) done++;
      return '<button type="button" class="chip pz' + (st ? ' ' + st : '') + (i === pIdx ? ' sel' : '') + '" data-i="' + i + '">' + (i + 1) + '</button>';
    }).join('');
    $('puzzle-progress').textContent = done + ' of ' + PUZZLES.length + ' solved';
  }
  $('puzzle-grid').addEventListener('click', function (ev) {
    var b = ev.target.closest('.chip');
    if (b) loadPuzzle(+b.dataset.i);
  });
  $('puzzle-prev').addEventListener('click', function () { loadPuzzle(pIdx - 1); });
  $('puzzle-next').addEventListener('click', function () { loadPuzzle(pIdx + 1); });
  $('puzzle-hint').addEventListener('click', function () {
    if (puzzleDrill.solved) return;
    $('puzzle-msg').innerHTML = '<span class="tag">' + THEMES[PUZZLES[pIdx].theme][0] + '</span> ' + THEMES[PUZZLES[pIdx].theme][1];
  });
  $('puzzle-show').addEventListener('click', function () {
    puzzleDrill.showAnswer().then(function (shown) {
      if (shown) $('puzzle-msg').innerHTML = 'The answer is highlighted. Play it and see what it does.';
    });
  });

  /* =====================================================================
   * LESSONS
   * ===================================================================== */
  var LESSONS = window.LESSONS || [];
  var lIdx = 0;
  var lessonDrill = new Drill(null, {
    onStep: function () { $('lesson-msg').innerHTML = '<b class="ok">Yes.</b> Free turn — keep going.'; },
    onWrong: function (d, pit, a, step) {
      $('lesson-msg').innerHTML = '<b class="bad">Not that one.</b> ' + esc(step.hint || 'Try again.');
    },
    onSolved: function () {
      var L = LESSONS[lIdx];
      saved.lessons[L.id] = 1; save();
      $('lesson-msg').innerHTML = '<b class="ok">Done.</b> ' + L.done;
      renderLessonNav();
    }
  });
  lessonDrill.view = new BoardView($('lesson-board'), function (p) { lessonDrill.click(p); }, ['You', 'Them']);

  function renderLessonNav() {
    $('lesson-nav').innerHTML = LESSONS.map(function (L, i) {
      return '<button type="button" class="chip lz' + (saved.lessons[L.id] ? ' ok' : '') + (i === lIdx ? ' sel' : '') +
        '" data-i="' + i + '" title="' + esc(L.title) + '">' + (i + 1) + '</button>';
    }).join('');
    $('lesson-next').textContent = lIdx === LESSONS.length - 1 ? 'On to the puzzles →' : 'Next lesson →';
  }
  function loadLesson(i) {
    lIdx = Math.max(0, Math.min(LESSONS.length - 1, i));
    var L = LESSONS[lIdx];
    $('lesson-title').textContent = (lIdx + 1) + '. ' + L.title;
    $('lesson-body').innerHTML = L.body.map(function (p) { return '<p>' + p + '</p>'; }).join('');
    $('lesson-status').innerHTML = '<b>Try it:</b> ' + L.task;
    $('lesson-msg').innerHTML = '<span class="muted">Click one of your pits (bottom row) on the board above.</span>';
    lessonDrill.load({ board: L.board, steps: L.steps, live: false });
    renderLessonNav();
  }
  $('lesson-nav').addEventListener('click', function (ev) {
    var b = ev.target.closest('.chip');
    if (b) loadLesson(+b.dataset.i);
  });
  $('lesson-reset').addEventListener('click', function () { loadLesson(lIdx); });
  $('lesson-next').addEventListener('click', function () {
    if (lIdx === LESSONS.length - 1) showTab('puzzles'); else loadLesson(lIdx + 1);
    window.scrollTo(0, 0);
  });

  /* ---------- tabs ---------- */
  var TABS = ['play', 'puzzles', 'learn'];
  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'play';
    TABS.forEach(function (t) { $('tab-' + t).hidden = t !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false');
    });
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ }
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
    b.addEventListener('click', function () { showTab(b.dataset.tab); });
  });

  /* ---------- boot ---------- */
  var firstUnsolved = 0;
  for (var pi = 0; pi < PUZZLES.length; pi++) if (!saved.puzzles[PUZZLES[pi].id]) { firstUnsolved = pi; break; }
  var firstLesson = 0;
  for (var li = 0; li < LESSONS.length; li++) if (!saved.lessons[LESSONS[li].id]) { firstLesson = li; break; }
  loadPuzzle(firstUnsolved);
  loadLesson(firstLesson);
  newGame();
  showTab((location.hash || '').slice(1) || 'play');
})();
