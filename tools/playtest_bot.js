#!/usr/bin/env node
// playtest_bot.js - a headless playtester that actually plays the game.
//
// Planning: Dijkstra from the player over a cost model that digs dirt
// (cost 1), pushes boulders aside (cost 3: horizontal only, needs empty
// ground behind the rock), avoids standing under boulders (+6) and enemy
// blast radii (+40). Boulders can roll randomly, so no plan survives
// contact with physics: every intended action is verified on a clone by a
// multi-tick ROLLOUT (apply the move, then let physics and enemies run
// several ticks in which the clone dodges danger exactly like the real
// bot would, so a rollout judges an action by what would actually be
// done next, not by standing still under a falling rock). A step whose
// rollout dies or gets pinned is never taken; its edge is banned so the
// planner reroutes, and the bot replans when reality diverges. A target
// whose every approach keeps killing in simulation is poisoned and
// skipped until the world changes. Danger mode kicks in when a boulder
// is falling or teetering within reach, or an enemy is close: then every
// candidate action (plan step, wait, four moves) is rolled out and the
// best survivor is taken - so waiting under a drop zone, sidestepping a
// rolling boulder, or racing a firefly are decided on simulated
// evidence, not hope. When no route exists to any objective the bot
// tunnels: rollout-safe steps toward the nearest flower or key, digging
// dirt to reshape the cave.
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
var ROLLOUT_IDLE = 7;   // idle ticks simulated after an action in danger mode
var CALM_IDLE = 2;      // idle ticks simulated after a calm step

function cloneState(st) {
  return {
    g: st.g.map(function (r) { return r.slice(); }),
    fall: st.fall.map(function (r) { return r.slice(); }),
    enemies: st.enemies.map(function (e) { return { x: e.x, y: e.y, dx: e.dx, dy: e.dy, type: e.type, t: e.t || 0 }; }),
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

// an action is vetoed only if it fails every attempt: rolls are random
function tryRollout(st, move, idle, attempts) {
  for (var a = 0; a < attempts; a++) {
    var s = actionRollout(st, move, idle);
    if (s) return s;
  }
  return null;
}

// how many legal moves does the player have? 0 means sealed in a pocket:
// alive, but the cave is as good as lost
function freedom(st) {
  var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]], f = 0;
  for (var i = 0; i < dirs.length; i++) {
    var dx = dirs[i][0], dy = dirs[i][1];
    var x = st.px + dx, y = st.py + dy;
    var t = st.g[y][x];
    if (t === D || t === E || t === M || t === KY) f++;
    else if (t === O && dy === 0 && st.g[y][x + dx] === E) f++;
    else if (t === X && doorOpen(st)) f++;
  }
  return f;
}

// one idle tick that dodges like the real bot would: the best single
// move by one-tick survival, enemy distance, and staying clear of
// overhead rock. Returns the advanced clone, or null if nothing survives.
function reactiveTick(s) {
  var tries = [[1, 0], [-1, 0], [0, 1], [0, -1], null];
  var best = null, bs = -1e9;
  for (var i = 0; i < tries.length; i++) {
    var s2 = cloneState(s);
    gameTick(s2, tries[i]);
    if (s2.dead || s2.squish) continue;
    if (tries[i] && (s2.px !== s.px + tries[i][0] || s2.py !== s.py + tries[i][1])) continue; // blocked
    var sc = enemyDist(s2, s2.px, s2.py) * 10;
    if (tries[i] === null) sc += 2; // prefer standing still when it is safe
    if (s2.py >= 1 && s2.g[s2.py - 1][s2.px] === O) sc -= 8; // don't loiter under rock
    sc += freedom(s2) * 3; // keep escape routes open while dodging
    if (sc > bs) { bs = sc; best = s2; }
  }
  return best;
}

// apply `move` (or null to wait) on a clone, then let `idle` ticks of
// physics and enemies play out. Idle ticks are REACTIVE: whenever the
// clone is in danger it dodges like the real bot would, so a rollout
// judges an action by what the bot would actually do next, not by
// standing still under a falling rock. Returns the surviving state, or
// null if the action dies, gets squished, or is blocked.
function actionRollout(st, move, idle) {
  var s = cloneState(st);
  gameTick(s, move);
  if (s.dead || s.squish) return null;
  if (s.done) return s;
  if (move && (s.px !== st.px + move[0] || s.py !== st.py + move[1])) return null;
  for (var i = 0; i < idle; i++) {
    if (s.dead || s.squish) return null;
    if (localDanger(s) || enemyDist(s, s.px, s.py) <= idle - i + 1) {
      var s2 = reactiveTick(s);
      if (!s2) return null;
      s = s2;
    } else {
      gameTick(s, null);
    }
  }
  if (s.dead || s.squish) return null;
  if (freedom(s) === 0) return null; // sealed into a pocket: as good as dead
  return s;
}

// a boulder is falling or teetering within reach of the player, or an
// enemy is close enough to matter: behave defensively this tick
function localDanger(st) {
  var x0 = Math.max(1, st.px - 4), x1 = Math.min(W - 2, st.px + 4);
  var y0 = Math.max(1, st.py - 6), y1 = Math.min(H - 2, st.py + 1);
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    if (st.fall[y][x]) return true;
    if (st.g[y][x] === O && y < st.py && st.g[y + 1][x] === E) return true; // about to drop in our window
  }
  if (enemyDist(st, st.px, st.py) <= 4) return true;
  return false;
}

// the best single step by a simple score: survives a rollout now, keeps
// enemies away; last resort when nothing deeper is available
function fallingToward(st) { // is a falling boulder on a clear path down to us?
  for (var y = st.py - 1; y >= 1; y--) {
    var t = st.g[y][st.px];
    if (t === O) return st.fall[y][st.px];
    if (t !== E) return false;
  }
  return false;
}

function bestStep(st, idle) {
  var best = null;
  var tries = [[1, 0], [-1, 0], [0, 1], [0, -1], null];
  for (var i = 0; i < tries.length; i++) {
    var sim = actionRollout(st, tries[i], idle);
    if (!sim) continue;
    var score = enemyDist(sim, sim.px, sim.py) * 10 - (tries[i] ? 0 : 1);
    if (!best || score > best.score) best = { move: tries[i], score: score };
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
  // dead-end check: passable ways out other than the way we came in
  var outs = 0, od = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (var oi = 0; oi < 4; oi++) {
    var ox = x + od[oi][0], oy = y + od[oi][1];
    if (ox === x - dx && oy === y - dy) continue;
    var ot = st.g[oy][ox];
    if (ot === E || ot === D || ot === M || ot === KY || ot === X) outs++;
    else if (ot === O && od[oi][1] === 0 && st.g[oy][ox + od[oi][0]] === E) outs++; // pushable
  }
  if (outs === 0) c += 30;                     // a pocket that can seal behind us
  for (var i = 0; i < st.enemies.length; i++) {
    var e = st.enemies[i];
    if (Math.abs(e.x - x) + Math.abs(e.y - y) <= 2) c += 40; // blast radius
  }
  return c;
}

// Dijkstra from the player to the cheapest target cell; returns the move list
function plan(st, isTarget, banned) {
  banned = banned || {};
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
      if (banned[cur.x + "," + cur.y + "," + nx + "," + ny]) continue; // this exact step keeps killing
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

// the nearest still-needed objective, for tunneling when no route exists
function nearestGoal(st) {
  var best = null, bd = 1e9;
  if (doorOpen(st)) return [st.ex, st.ey];
  for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
    var t = st.g[y][x];
    if (t !== M && t !== KY) continue;
    if (t === M && st.collected >= st.needed) continue;
    if (t === KY && st.keys >= (st.needKeys || 0)) continue;
    var d = Math.abs(x - st.px) + Math.abs(y - st.py);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}

// cells the player could reach right now (dirt, empties, pickups; pushable
// boulders count too, since pushing is just walking into them)
function reachSet(st) {
  var seen = [], q = [[st.px, st.py]];
  for (var y = 0; y < H; y++) seen.push(new Array(W).fill(false));
  seen[st.py][st.px] = true;
  while (q.length) {
    var p = q.pop(), x = p[0], y = p[1];
    var od = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nx = x + od[i][0], ny = y + od[i][1];
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1 || seen[ny][nx]) continue;
      var t = st.g[ny][nx];
      if (t === E || t === D || t === M || t === KY) { seen[ny][nx] = true; q.push([nx, ny]); }
      else if (t === O && od[i][1] === 0 && st.g[ny][nx + od[i][0]] === E) { seen[ny][nx] = true; q.push([nx, ny]); } // pushable
    }
  }
  return seen;
}

// when sealed away from an objective, the way out is usually a boundary
// boulder: dig the cell beneath it (from inside our region) and it drops
// out of the corridor it was plugging. Returns [x, y] of the dig target.
function plugTarget(st, seen) {
  var best = null, bd = 1e9;
  for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) {
    if (st.g[y][x] !== O) continue;
    var adjR = false, promising = false;
    var od = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nx = x + od[i][0], ny = y + od[i][1];
      if (seen[ny] && seen[ny][nx]) adjR = true;
      else {
        var t = st.g[ny][nx];
        if (t === E || t === D || t === M || t === KY) promising = true; // open world beyond the plug
      }
    }
    if (!adjR) continue;
    if (st.g[y + 1][x] !== D || !seen[y + 1][x]) continue; // must be diggable from our side
    var d = Math.abs(x - st.px) + Math.abs(y + 1 - st.py) - (promising ? 40 : 0); // prefer plugs with open land beyond
    if (d < bd) { bd = d; best = [x, y + 1]; }
  }
  return best;
}

// plan a route to the best plug-dig target, or null
function tryPlug(st, banned) {
  var seen = reachSet(st);
  var plug = plugTarget(st, seen);
  if (!plug) return null;
  var leg = plan(st, function (x, y) { return x === plug[0] && y === plug[1]; }, banned);
  return leg ? { moves: leg.moves, tx: plug[0], ty: plug[1] } : null;
}

function playCave(n) {
  var L = genLevel(n);
  var st = mkState(L);
  var budget = st.time;
  var replans = 0, waits = 0, stuckWait = 0, ticks = 0, rejections = 0, gambles = 0, tunnels = 0, waitStreak = 0;
  var path = null, legT = null, poison = {}, banned = {}, rejCounts = {};
  var visited = []; // tick stamp of the bot's last visit to each cell
  for (var vy = 0; vy < H; vy++) visited.push(new Array(W).fill(-999));
  visited[st.py][st.px] = 0;
  var seenX = st.px, seenY = st.py;
  var lastNew = 0; // last tick we set foot somewhere fresh: stalls trigger tunneling
  var result = { n: n, pass: false, reason: "", time: 0, budget: budget, collected: 0, keys: 0 };
  while (!st.done && !st.dead && st.time > 0 && ticks < 8000) { // 8000 ticks covers the 1000s deep-cave budgets
    ticks++;
    if (st.squish) { // a boulder has us: the player's input freezes, so does ours
      gameTick(st, null);
      continue;
    }
    if (st.px !== seenX || st.py !== seenY) { // we moved since last tick: bookkeep novelty
      if (visited[st.py][st.px] < ticks - 80) lastNew = ticks;
      visited[st.py][st.px] = ticks;
      seenX = st.px; seenY = st.py;
    }

    // stalled (ping-pong loops, poison cycling, enemy standoffs): force
    // rollout-safe exploration toward the nearest goal, digging as we go
    var stall = ticks - lastNew;
    if (stall > 150) {
      if (stall > 400 && (Object.keys(poison).length || Object.keys(banned).length)) {
        poison = {}; banned = {}; rejCounts = {}; // prolonged stall: forgive everything
      }
      if (!path || !path.length) { // sealed off? dig under the boundary boulder
        var pl = tryPlug(st, banned);
        if (pl) { path = pl.moves; legT = [pl.tx, pl.ty]; stuckWait = 0; }
      }
      if (!path || !path.length) {
      var goal2 = nearestGoal(st);
      var tun2 = null, tun2Score = -1e9;
      var tries2 = [[1, 0], [-1, 0], [0, 1], [0, -1], null];
      for (var t2i = 0; t2i < tries2.length; t2i++) {
        var mv2 = tries2[t2i];
        var sim2 = tryRollout(st, mv2, mv2 ? 3 : ROLLOUT_IDLE, 2);
        if (!sim2) continue;
        var sc2 = enemyDist(sim2, sim2.px, sim2.py) * 5;
        if (goal2) sc2 -= Math.abs(sim2.px - goal2[0]) + Math.abs(sim2.py - goal2[1]);
        if (mv2) {
          if (visited[sim2.py][sim2.px] < ticks - 80) sc2 += 25; // fresh ground beats circling
        } else sc2 -= 5; // waiting is not exploration
        if (sc2 > tun2Score) { tun2Score = sc2; tun2 = mv2; }
      }
      if (tun2) {
        tunnels++;
        gameTick(st, tun2);
        if (st.dead) break;
        path = null; legT = null;
        continue;
      }
      }
    }

    // no current plan: try to make one
    if (!path || !path.length) {
      var leg = plan(st, targets(st, poison), banned);
      if (leg) {
        path = leg.moves;
        legT = [leg.tx, leg.ty];
        stuckWait = 0;
      } else if (Object.keys(banned).length) {
        banned = {}; rejCounts = {}; // every route is banned: give them all a fresh chance
        stuckWait++;
        gameTick(st, null);
        waits++; waitStreak++;
        continue;
      } else if (Object.keys(poison).length) {
        poison = {}; // every approach is poisoned: give them all a fresh chance
        stuckWait++;
        var s2 = actionRollout(st, null, ROLLOUT_IDLE);
        if (!s2) {
          var g2 = bestStep(st, 1);
          gameTick(st, g2 ? g2.move : null);
          if (st.dead) break;
        } else gameTick(st, null);
        waits++; waitStreak++;
        continue;
      } else {
        var pl2 = tryPlug(st, banned);
        if (pl2) { path = pl2.moves; legT = [pl2.tx, pl2.ty]; stuckWait = 0; continue; }
        // truly no route: tunnel toward the nearest objective, digging as we go
        stuckWait++;
        if (stuckWait > 400) { // only after the stall-tunneling had every chance to unseal us
          result.reason = "stuck: no route to any " + (doorOpen(st) ? "exit" : "flower/key");
          break;
        }
        var goal = nearestGoal(st);
        var tun = null, tunScore = -1e9;
        var tries = [[1, 0], [-1, 0], [0, 1], [0, -1], null];
        for (var ti = 0; ti < tries.length; ti++) {
          var mv = tries[ti];
          var sim = tryRollout(st, mv, mv ? 3 : ROLLOUT_IDLE, 2);
          if (!sim) continue;
          var sc = enemyDist(sim, sim.px, sim.py) * 5;
          if (goal) sc -= Math.abs(sim.px - goal[0]) + Math.abs(sim.py - goal[1]);
          if (mv === null) sc -= 3;
          if (sc > tunScore) { tunScore = sc; tun = mv; }
        }
        if (tun) {
          tunnels++;
          gameTick(st, tun);
          if (st.dead) break;
        } else {
          gameTick(st, null);
          waits++;
        }
        continue;
      }
    }

    // danger mode: verify every candidate action by rollout, take the best survivor
    if (localDanger(st)) {
      // fast path: nothing is dropping on us this tick and the planned step
      // survives its rollout - take it without scoring the other candidates
      if (!fallingToward(st) && enemyDist(st, st.px, st.py) > 2 && path[0] &&
          actionRollout(st, path[0], 3)) {
        var bfast = { c: st.collected, k: st.keys, x: st.px, y: st.py };
        gameTick(st, path[0]);
        if (st.dead) break;
        if (st.px === bfast.x + path[0][0] && st.py === bfast.y + path[0][1]) {
          path.shift();
          waitStreak = 0;
          if (st.collected !== bfast.c || st.keys !== bfast.k) {
            poison = {}; banned = {}; rejCounts = {};
            path = null; legT = null;
          }
        } else { // blocked or diverted in real play: replan
          replans++;
          path = null; legT = null;
        }
        continue;
      }
      var cands = [path[0], null, [1, 0], [-1, 0], [0, -1], [0, 1]];
      var seen = {}, pick = null, pickScore = -1e9;
      for (var ci = 0; ci < cands.length; ci++) {
        var cand = cands[ci];
        var ck = cand ? cand[0] + "," + cand[1] : "w";
        if (seen[ck]) continue;
        seen[ck] = 1;
        var rs = tryRollout(st, cand, cand === null ? ROLLOUT_IDLE : 3, 2);
        if (!rs) {
          if (cand === path[0]) { // the planned approach keeps failing: ban the edge
            var bkey2 = st.px + "," + st.py + "," + (st.px + cand[0]) + "," + (st.py + cand[1]);
            rejCounts[bkey2] = (rejCounts[bkey2] || 0) + 1;
            banned[bkey2] = 1;
            if (rejCounts[bkey2] >= 2 && legT && st.g[legT[1]][legT[0]] !== X) poison[legT[0] + "," + legT[1]] = 1;
          }
          continue;
        }
        var rsc = enemyDist(rs, rs.px, rs.py) * 10;
        if (cand === path[0]) rsc += 12; // keep pursuing the plan when it is safe
        if (cand === null) rsc += 2;    // and prefer calm waiting over wandering
        if (legT) rsc -= Math.abs(rs.px - legT[0]) + Math.abs(rs.py - legT[1]) * 0.5;
        if (rsc > pickScore) { pickScore = rsc; pick = cand; }
      }
      if (!pick) { // nothing survives: gamble on the best one-tick survivor
        gambles++;
        var g = bestStep(st, 1);
        gameTick(st, g ? g.move : null);
        if (st.dead) break;
        rejections = 0;
        path = null; legT = null;
        continue;
      }
      var before = { c: st.collected, k: st.keys, x: st.px, y: st.py };
      gameTick(st, pick);
      if (st.dead) break;
      if (pick) {
        if (st.px !== before.x + pick[0] || st.py !== before.y + pick[1]) { // blocked or diverted
          replans++;
          path = null; legT = null;
          continue;
        }
        path.shift();
        waitStreak = 0;
      } else { waits++; waitStreak++; }
      if (st.collected !== before.c || st.keys !== before.k) {
        poison = {}; // progress: forgive the poisoned
        path = null; legT = null;
      }
      continue;
    }

    // calm mode: the next step plus a little settling must survive
    if (waitStreak > 25) { // caution has become paralysis: race whatever is there
      var rs2 = actionRollout(st, path[0], 1);
      if (rs2) {
        gameTick(st, path[0]);
        if (st.dead) break;
        path.shift();
        waitStreak = 0;
        continue;
      }
      waitStreak = 0;
    }
    var sim = tryRollout(st, path[0], CALM_IDLE, 2);
    if (!sim) { // this step dies or jams down the line: ban it, take the next-best route
      replans++;
      rejections++;
      var bkey = st.px + "," + st.py + "," + (st.px + path[0][0]) + "," + (st.py + path[0][1]);
      rejCounts[bkey] = (rejCounts[bkey] || 0) + 1;
      banned[bkey] = 1;
      if (rejCounts[bkey] >= 2 && legT && st.g[legT[1]][legT[0]] !== X) {
        poison[legT[0] + "," + legT[1]] = 1; // every approach to this target kills: come back later
      }
      if (rejections >= 12) { // boxed in: gamble on any step that survives this tick
        gambles++;
        var g3 = bestStep(st, 1);
        rejections = 0;
        gameTick(st, g3 ? g3.move : null);
        if (st.dead) break;
        waitStreak = 0;
        banned = {}; rejCounts = {};
      } else {
        gameTick(st, null);
        waits++;
        waitStreak++;
      }
      path = null; legT = null;
      continue;
    }
    rejections = 0;
    var before2 = { c: st.collected, k: st.keys, x: st.px, y: st.py };
    gameTick(st, path[0]);
    if (st.dead) break; // unlucky roll divergence: a genuine playtest death
    if (st.px !== before2.x + path[0][0] || st.py !== before2.y + path[0][1] || st.collected !== before2.c || st.keys !== before2.k) {
      replans++; // the push failed or a pickup changed the goal set
      path = null;
      continue;
    }
    if (st.collected !== before2.c || st.keys !== before2.k) {
      poison = {}; banned = {}; rejCounts = {}; // progress: forgive the poisoned and the banned
      path = null;
    }
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
  var leftM = 0, leftK = 0;
  for (var ry = 0; ry < H; ry++) for (var rx = 0; rx < W; rx++) { if (st.g[ry][rx] === M) leftM++; else if (st.g[ry][rx] === KY) leftK++; }
  result.leftM = leftM; result.leftK = leftK;
  result.ticks = ticks;
  result.replans = replans;
  result.waits = waits;
  result.gambles = gambles;
  result.tunnels = tunnels;
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
    "  left " + r.leftM + "M/" + r.leftK + "K" +
    (r.pass ? "" : "  (" + r.reason + ")"));
}
console.log("");
console.log(passes + "/" + (end - start + 1) + " caves cleared in " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
if (fails.length) {
  console.log("failures: " + fails.map(function (f) { return f.n + " (" + f.reason + ")"; }).join(", "));
  process.exit(1);
}
