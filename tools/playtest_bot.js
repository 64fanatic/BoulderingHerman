#!/usr/bin/env node
// playtest_bot.js - a headless playtester that actually plays the game.
//
// Planning: Dijkstra from the player over a cost model that digs dirt
// (cost 1), pushes boulders aside (cost 3: horizontal only, needs empty
// ground behind the rock), avoids standing under boulders (+6) and enemy
// blast radii (+40). Boulder rolls are randomized, so no plan survives
// contact with physics: every planned step is first simulated on a clone
// - a step that dies or gets pinned is never taken - and the bot replans
// whenever reality diverges. A target whose approach keeps killing in
// simulation is poisoned and skipped until the world changes. While
// boulders fall, the bot waits, sidesteps anything dropping on it, and
// keeps its distance from fireflies; boxed in, it gambles on any step
// that survives the current tick.
//
// Usage:
//   node tools/playtest_bot.js            all 100 caves
//   node tools/playtest_bot.js 30        cave 30
//   node tools/playtest_bot.js 20 40      caves 20 through 40
//
// Exit status: 0 if every cave was cleared, 1 if any cave failed.

var fs = require("fs");
var path = require("path");

// pull in the real engine: same physics, same generator, same rules
eval(fs.readFileSync(path.join(__dirname, "..", "src", "engine.js"), "utf8"));

var TICKS = TICK / 1000;

function cloneState(st) {
  return {
    g: st.g.map(function (r) { return r.slice(); }),
    fall: st.fall.map(function (r) { return r.slice(); }),
    enemies: st.enemies.map(function (e) { return { x: e.x, y: e.y, dx: e.dx, dy: e.dy, type: e.type }; }),
    px: st.px, py: st.py, ex: st.ex, ey: st.ey,
    needed: st.needed, time: st.time, collected: st.collected,
    keys: st.keys, needKeys: st.needKeys,
    dead: st.dead, done: st.done,
    squish: st.squish ? { x: st.squish.x, y: st.squish.y, t: st.squish.t } : null
  };
}

function gameTick(st, move) { // mirrors main.js: input, then physics, then enemies
  if (move) tryMove(st, move[0], move[1]);
  if (st.dead || st.done) return;
  physics(st);
  enemyStep(st);
  st.time -= TICKS;
}

function anyFalling(st) {
  for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) if (st.fall[y][x]) return true;
  return false;
}

function fallingToward(st) { // is a falling boulder on a clear path down to us?
  for (var y = st.py - 1; y >= 1; y--) {
    var t = st.g[y][st.px];
    if (t === O) return st.fall[y][st.px];
    if (t !== E) return false;
  }
  return false;
}

function enemyDist(st, x, y) {
  var d = 99;
  for (var i = 0; i < st.enemies.length; i++) {
    var e = st.enemies[i];
    if (st.g[e.y][e.x] !== e.type) continue; // destroyed by a blast: no threat
    var m = Math.abs(e.x - x) + Math.abs(e.y - y);
    if (m < d) d = m;
  }
  return d;
}

// safe for this one tick? the reactive layer deals with whatever follows.
// Stepping into the open exit leaves the player in place and wins the cave.
function singleSafe(st, move) {
  var sim = cloneState(st);
  gameTick(sim, move);
  if (sim.dead || sim.squish) return null;
  if (sim.done || !move) return sim;
  return (sim.px === st.px + move[0] && sim.py === st.py + move[1]) ? sim : null;
}

// the best single step by a simple score: survives now, keeps enemies away,
// prefers escaping the drop column sideways (vertical moves never outrun rock)
function bestStep(st, preferSideways) {
  var best = null;
  var tries = [[1, 0], [-1, 0], [0, 1], [0, -1], null];
  for (var i = 0; i < tries.length; i++) {
    if (preferSideways && tries[i] && tries[i][1] !== 0) continue;
    var sim = singleSafe(st, tries[i]);
    if (!sim) continue;
    var score = enemyDist(sim, sim.px, sim.py) * 10 - (tries[i] ? 0 : 1);
    if (!best || score > best.score) best = { move: tries[i], score: score };
  }
  if (!best && preferSideways) { // no safe sidestep: any passable one beats certain squish
    var shove = [[1, 0], [-1, 0]];
    for (var s = 0; s < shove.length; s++) {
      var t = st.g[st.py][st.px + shove[s][0]];
      if (t === E || t === D || t === M || t === KY) return { move: shove[s] };
    }
  }
  return best;
}

// cost of entering (x,y) moving by (dx,dy), or null if impossible
function stepCost(st, x, y, dx, dy) {
  var t = st.g[y][x];
  var c = 1;
  if (t === S || t === K || t === F || t === B) return null; // walls; walking into an enemy explodes
  if (t === O) {
    if (dy !== 0) return null;                 // boulders only push sideways
    if (st.g[y][x + dx] !== E) return null;    // and need empty ground behind them
    c += 2;
  }
  if (t === X && !doorOpen(st)) return null;   // the door opens, it isn't climbed over
  if (st.g[y - 1][x] === O) c += 6;            // standing under rock is asking for it
  for (var i = 0; i < st.enemies.length; i++) {
    var e = st.enemies[i];
    if (Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1) c += 40; // blast radius
  }
  return c;
}

// Dijkstra from the player to the cheapest target cell; returns the move list
function plan(st, isTarget) {
  var INF = 1e9;
  var dist = [], from = [];
  for (var y = 0; y < H; y++) { dist.push(new Array(W).fill(INF)); from.push(new Array(W).fill(null)); }
  dist[st.py][st.px] = 0;
  var heap = [];
  function push(node) {
    heap.push(node);
    var i = heap.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (heap[p].c <= heap[i].c) break;
      var tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp;
      i = p;
    }
  }
  function pop() {
    var top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < heap.length && heap[l].c < heap[m].c) m = l;
        if (r < heap.length && heap[r].c < heap[m].c) m = r;
        if (m === i) break;
        var t2 = heap[m]; heap[m] = heap[i]; heap[i] = t2;
        i = m;
      }
    }
    return top;
  }
  push({ c: 0, x: st.px, y: st.py });
  var best = null;
  while (heap.length) {
    var cur = pop();
    if (cur.c > dist[cur.y][cur.x]) continue;
    if (isTarget(cur.x, cur.y) && !(cur.x === st.px && cur.y === st.py)) {
      best = cur;
      break; // first target popped is the cheapest: Dijkstra
    }
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var d = 0; d < 4; d++) {
      var dx = dirs[d][0], dy = dirs[d][1];
      var nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      var c = stepCost(st, nx, ny, dx, dy);
      if (c === null) continue;
      var nc = cur.c + c;
      if (nc < dist[ny][nx]) {
        dist[ny][nx] = nc;
        from[ny][nx] = { x: cur.x, y: cur.y };
        push({ c: nc, x: nx, y: ny });
      }
    }
  }
  if (!best) return null;
  var moves = [];
  var cx = best.x, cy = best.y;
  while (cx !== st.px || cy !== st.py) {
    var p = from[cy][cx];
    moves.unshift([cx - p.x, cy - p.y]);
    cx = p.x; cy = p.y;
  }
  return { moves: moves, tx: best.x, ty: best.y };
}

function targets(st, poison) {
  if (doorOpen(st)) return function (x, y) { return x === st.ex && y === st.ey; };
  var wantFlowers = st.collected < st.needed;
  var wantKeys = st.keys < (st.needKeys || 0);
  return function (x, y) {
    var t = st.g[y][x];
    if (poison[x + "," + y]) return false; // its approach kills: come back later
    return (wantFlowers && t === M) || (wantKeys && t === KY);
  };
}

function playCave(n) {
  var L = genLevel(n);
  var st = mkState(L);
  var budget = st.time;
  var replans = 0, waits = 0, stuckWait = 0, ticks = 0, rejections = 0, gambles = 0;
  var path = null, legT = null, poison = {};
  var result = { n: n, pass: false, reason: "", time: 0, budget: budget, collected: 0, keys: 0 };
  while (!st.done && !st.dead && st.time > 0 && ticks < 5000) {
    ticks++;
    if (st.squish) { // a boulder has us: the player's input freezes, so does ours
      gameTick(st, null);
      continue;
    }
    var threat = enemyDist(st, st.px, st.py) <= 2;
    if (anyFalling(st)) {
      var step = fallingToward(st) || threat ? bestStep(st, fallingToward(st)) : null;
      if (!step && enemyDist(st, st.px, st.py) > 3) { gameTick(st, null); waits++; }
      else if (!step) step = bestStep(st, false);
      if (step) gameTick(st, step.move);
      if (st.dead) break;
      poison = {}; // the world moved: old dangers are old news
      path = null;
      continue;
    }
    // enemies nearby while calm: the planner's blast-radius costs keep the
    // route away from them; racing them beats running forever
    if (!path || !path.length) {
      var leg = plan(st, targets(st, poison));
      if (leg) {
        path = leg.moves;
        legT = [leg.tx, leg.ty];
        stuckWait = 0;
      } else if (Object.keys(poison).length) {
        poison = {}; // every approach is poisoned: give them all a fresh chance
        stuckWait++;
        gameTick(st, null);
        waits++;
        continue;
      } else {
        stuckWait++;
        if (stuckWait > 30) {
          result.reason = "stuck: no route to any " + (doorOpen(st) ? "exit" : "flower/key");
          break;
        }
        gameTick(st, null);
        waits++;
        continue;
      }
    }
    var sim = singleSafe(st, path[0]);
    if (!sim) { // this step dies or gets pinned: never take it
      replans++;
      rejections++;
      if (legT && st.g[legT[1]][legT[0]] !== X) poison[legT[0] + "," + legT[1]] = 1; // try another target
      if (rejections >= 12) { // boxed in: gamble on any step that survives this tick
        gambles++;
        var g = bestStep(st, false);
        rejections = 0;
        gameTick(st, g ? g.move : null);
        if (st.dead) break;
      } else {
        gameTick(st, null);
      }
      path = null;
      legT = null;
      continue;
    }
    rejections = 0;
    var before = { c: st.collected, k: st.keys, x: st.px, y: st.py };
    gameTick(st, path[0]);
    if (st.dead) break; // unlucky roll divergence: a genuine playtest death
    if (st.px !== before.x + path[0][0] || st.py !== before.y + path[0][1] || st.collected !== before.c || st.keys !== before.k) {
      replans++; // the push failed or a pickup changed the goal set
      path = null;
      continue;
    }
    if (st.collected !== before.c || st.keys !== before.k) poison = {}; // progress: forgive the poisoned
    path.shift();
  }
  result.time = Math.max(0, budget - st.time);
  result.collected = st.collected;
  result.keys = st.keys;
  if (st.done) {
    result.pass = true;
  } else if (st.dead) {
    result.reason = "died";
  } else if (!result.reason) {
    result.reason = st.time <= 0 ? "timeout" : "gave up";
  }
  result.ticks = ticks;
  result.replans = replans;
  result.waits = waits;
  result.gambles = gambles;
  return result;
}

var args = process.argv.slice(2).map(Number).filter(function (v) { return !isNaN(v); });
var start = args.length ? Math.max(1, Math.min(100, args[0])) : 1;
var end = args.length > 1 ? Math.max(start, Math.min(100, args[1])) : start;
if (!args.length) end = 100;

var passes = 0, fails = [], t0 = Date.now();
for (var n = start; n <= end; n++) {
  var r = playCave(n);
  if (r.pass) passes++;
  else fails.push(r);
  console.log("cave " + String(r.n).padStart(3) + ": " + (r.pass ? "PASS" : "FAIL") +
    "  " + r.time.toFixed(0) + "s / " + r.budget + "s" +
    "  flowers " + r.collected + " keys " + r.keys +
    (r.pass ? "" : "  (" + r.reason + ")"));
}
console.log("");
console.log(passes + "/" + (end - start + 1) + " caves cleared in " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
if (fails.length) {
  console.log("failures: " + fails.map(function (f) { return f.n + " (" + f.reason + ")"; }).join(", "));
  process.exit(1);
}
