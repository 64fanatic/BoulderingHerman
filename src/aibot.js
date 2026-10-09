// aibot.js - the in-game AI pilot, the same brain as tools/playtest_bot.js.
//
// The headless playtester runs its own game loop; this port drives the real
// game instead: AIBOT.decide(st) is called once per tick before the input
// is applied and returns the move to take (or null to stand still). All the
// post-step bookkeeping (did the step land, was something picked up, did a
// boulder block us) is reconciled at the start of the next call, because
// the live tick - not the bot - advances the world.
//
// The strategy is the playtester's: Dijkstra over a dig/push cost model,
// every intended step verified by a multi-tick rollout on a clone in which
// the clone itself dodges like the real bot would, edges that keep killing
// are banned so the planner reroutes, targets whose every approach dies
// are poisoned, boulder-teetering or enemy-nearby ticks switch to a full
// candidate shootout, stalls trigger forced exploration, and sealed regions
// are unsealed by digging the ground out from under the plugging boulder.
(function () {
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
      dead: st.dead, done: st.done, booms: st.booms || 0,
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
      if (st.g[e.y][e.x] !== e.type) continue;
      var m = Math.abs(e.x - x) + Math.abs(e.y - y);
      if (m < d) d = m;
    }
    return d;
  }

  function tryRollout(st, move, idle, attempts) { // vetoed only if every attempt fails
    for (var a = 0; a < attempts; a++) {
      var s = actionRollout(st, move, idle);
      if (s) return s;
    }
    return null;
  }

  // how many legal moves does the player have? 0 means sealed in a pocket
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
  // move by one-tick survival, enemy distance, escape routes and overhead rock
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

  // apply `move` (or null to wait) on a clone, then let `idle` ticks play out.
  // Idle ticks are REACTIVE: the clone dodges like the bot would, so a
  // rollout judges an action by what would actually be done next.
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

  function fallingToward(st) { // is a falling boulder on a clear path down to us?
    for (var y = st.py - 1; y >= 1; y--) {
      var t = st.g[y][st.px];
      if (t === O) return st.fall[y][st.px];
      if (t !== E) return false;
    }
    return false;
  }

  // a boulder is falling or teetering within reach, or an enemy is close
  function localDanger(st) {
    var x0 = Math.max(1, st.px - 4), x1 = Math.min(W - 2, st.px + 4);
    var y0 = Math.max(1, st.py - 6), y1 = Math.min(H - 2, st.py + 1);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      if (st.fall[y][x]) return true;
      if (st.g[y][x] === O && y < st.py && st.g[y + 1][x] === E) return true;
    }
    if (enemyDist(st, st.px, st.py) <= 4) return true;
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
    if (t === S || t === K || t === F || t === B) return null;
    if (t === O) {
      if (dy !== 0) return null;
      if (st.g[y][x + dx] !== E) return null;
      c += 2;
    }
    if (t === X && !doorOpen(st)) return null;
    if (st.g[y - 1][x] === O) c += 6;
    var outs = 0, od = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var oi = 0; oi < 4; oi++) {
      var ox = x + od[oi][0], oy = y + od[oi][1];
      if (ox === x - dx && oy === y - dy) continue;
      var ot = st.g[oy][ox];
      if (ot === E || ot === D || ot === M || ot === KY || ot === X) outs++;
      else if (ot === O && od[oi][1] === 0 && st.g[oy][ox + od[oi][0]] === E) outs++;
    }
    if (outs === 0) c += 30; // a pocket that can seal behind us
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
        break;
      }
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var d = 0; d < 4; d++) {
        var dx = dirs[d][0], dy = dirs[d][1];
        var nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        if (banned[cur.x + "," + cur.y + "," + nx + "," + ny]) continue;
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
      if (poison[x + "," + y]) return false;
      return (wantFlowers && t === M) || (wantKeys && t === KY);
    };
  }

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
        else if (t === O && od[i][1] === 0 && st.g[ny][nx + od[i][0]] === E) { seen[ny][nx] = true; q.push([nx, ny]); }
      }
    }
    return seen;
  }

  // when sealed away from an objective, dig the cell under a boundary boulder
  // so it drops out of the corridor it was plugging
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
          if (t === E || t === D || t === M || t === KY) promising = true;
        }
      }
      if (!adjR) continue;
      if (st.g[y + 1][x] !== D || !seen[y + 1][x]) continue;
      var d = Math.abs(x - st.px) + Math.abs(y + 1 - st.py) - (promising ? 40 : 0);
      if (d < bd) { bd = d; best = [x, y + 1]; }
    }
    return best;
  }

  function tryPlug(st, banned) {
    var seen = reachSet(st);
    var plug = plugTarget(st, seen);
    if (!plug) return null;
    var leg = plan(st, function (x, y) { return x === plug[0] && y === plug[1]; }, banned);
    return leg ? { moves: leg.moves, tx: plug[0], ty: plug[1] } : null;
  }

  // ---- the pilot's per-cave memory ----
  var S = null;

  function reset() {
    S = {
      ticks: 0, path: null, legT: null, poison: {}, banned: {}, rejCounts: {},
      visited: null, seenX: -1, seenY: -1, lastNew: 0, waitStreak: 0, stuckWait: 0,
      rejections: 0, pend: null, pendBefore: null // the move we asked for last tick
    };
  }

  function decide(st) {
    if (!S) reset();
    if (!S.visited) {
      S.visited = [];
      for (var vy = 0; vy < H; vy++) S.visited.push(new Array(W).fill(-999));
    }
    S.ticks++;
    if (st.squish || st.dead || st.done) { S.pend = null; S.pendBefore = null; return null; }

    // reconcile: the live tick already applied our pending move, judge it now
    if (S.pend !== null && S.pend !== undefined && S.pendBefore) {
      var mv = S.pend, bf = S.pendBefore;
      S.pend = null; S.pendBefore = null;
      if (mv) {
        if (st.px === bf.x + mv[0] && st.py === bf.y + mv[1]) { // the step landed
          if (S.path && S.path.length) S.path.shift();
          if (st.collected !== bf.c || st.keys !== bf.k) { // progress: forgive everything
            S.poison = {}; S.banned = {}; S.rejCounts = {};
            S.path = null; S.legT = null;
          }
        } else { // blocked or diverted: replan
          S.path = null; S.legT = null;
        }
      }
    } else {
      S.pend = null; S.pendBefore = null;
    }

    if (st.px !== S.seenX || st.py !== S.seenY) { // bookkeep ground novelty
      if (S.visited[st.py][st.px] < S.ticks - 80) S.lastNew = S.ticks;
      S.visited[st.py][st.px] = S.ticks;
      S.seenX = st.px; S.seenY = st.py;
    }

    function go(move) { // remember what we asked for; the tick applies it
      S.pend = move;
      S.pendBefore = move ? { c: st.collected, k: st.keys, x: st.px, y: st.py } : null;
      return move;
    }

    // stalled (ping-pong loops, poison cycling): rollout-safe exploration
    var stall = S.ticks - S.lastNew;
    if (stall > 150) {
      if (stall > 400 && (Object.keys(S.poison).length || Object.keys(S.banned).length)) {
        S.poison = {}; S.banned = {}; S.rejCounts = {};
      }
      if (!S.path || !S.path.length) {
        var pl = tryPlug(st, S.banned);
        if (pl) { S.path = pl.moves; S.legT = [pl.tx, pl.ty]; S.stuckWait = 0; }
      }
      if (!S.path || !S.path.length) {
        var goal2 = nearestGoal(st), tun2 = null, tun2Score = -1e9;
        var tries2 = [[1, 0], [-1, 0], [0, 1], [0, -1], null];
        for (var t2i = 0; t2i < tries2.length; t2i++) {
          var mv2 = tries2[t2i];
          var sim2 = tryRollout(st, mv2, mv2 ? 3 : ROLLOUT_IDLE, 2);
          if (!sim2) continue;
          var sc2 = enemyDist(sim2, sim2.px, sim2.py) * 5;
          if (goal2) sc2 -= Math.abs(sim2.px - goal2[0]) + Math.abs(sim2.py - goal2[1]);
          if (mv2) {
            if (S.visited[sim2.py][sim2.px] < S.ticks - 80) sc2 += 25;
          } else sc2 -= 5;
          if (sc2 > tun2Score) { tun2Score = sc2; tun2 = mv2; }
        }
        if (tun2) { S.path = null; S.legT = null; return go(tun2); }
      }
    }

    // no current plan: try to make one
    if (!S.path || !S.path.length) {
      var leg = plan(st, targets(st, S.poison), S.banned);
      if (leg) {
        S.path = leg.moves;
        S.legT = [leg.tx, leg.ty];
        S.stuckWait = 0;
      } else if (Object.keys(S.banned).length) {
        S.banned = {}; S.rejCounts = {};
        S.stuckWait++; S.waitStreak++;
        return go(null);
      } else if (Object.keys(S.poison).length) {
        S.poison = {};
        S.stuckWait++; S.waitStreak++;
        var s2 = actionRollout(st, null, ROLLOUT_IDLE);
        if (!s2) {
          var g2 = bestStep(st, 1);
          if (g2) return go(g2.move);
        }
        return go(null);
      } else {
        var pl2 = tryPlug(st, S.banned);
        if (pl2) { S.path = pl2.moves; S.legT = [pl2.tx, pl2.ty]; S.stuckWait = 0; }
        else {
          S.stuckWait++;
          var goal = nearestGoal(st), tun = null, tunScore = -1e9;
          var tries = [[1, 0], [-1, 0], [0, 1], [0, -1], null];
          for (var ti = 0; ti < tries.length; ti++) {
            var mv3 = tries[ti];
            var sim = tryRollout(st, mv3, mv3 ? 3 : ROLLOUT_IDLE, 2);
            if (!sim) continue;
            var sc = enemyDist(sim, sim.px, sim.py) * 5;
            if (goal) sc -= Math.abs(sim.px - goal[0]) + Math.abs(sim.py - goal[1]);
            if (mv3 === null) sc -= 3;
            if (sc > tunScore) { tunScore = sc; tun = mv3; }
          }
          return go(tun); // tun may be null: stand and think
        }
      }
    }

    // danger mode: verify every candidate action by rollout, take the best survivor
    if (localDanger(st)) {
      if (!fallingToward(st) && enemyDist(st, st.px, st.py) > 2 && S.path[0] &&
          actionRollout(st, S.path[0], 3)) {
        S.waitStreak = 0;
        return go(S.path[0]); // fast path: the planned step is simply safe
      }
      var cands = [S.path[0], null, [1, 0], [-1, 0], [0, -1], [0, 1]];
      var seen = {}, pick = null, pickScore = -1e9;
      for (var ci = 0; ci < cands.length; ci++) {
        var cand = cands[ci];
        var ck = cand ? cand[0] + "," + cand[1] : "w";
        if (seen[ck]) continue;
        seen[ck] = 1;
        var rs = tryRollout(st, cand, cand === null ? ROLLOUT_IDLE : 3, 2);
        if (!rs) {
          if (cand === S.path[0]) {
            var bkey2 = st.px + "," + st.py + "," + (st.px + cand[0]) + "," + (st.py + cand[1]);
            S.rejCounts[bkey2] = (S.rejCounts[bkey2] || 0) + 1;
            S.banned[bkey2] = 1;
            if (S.rejCounts[bkey2] >= 2 && S.legT && st.g[S.legT[1]][S.legT[0]] !== X) S.poison[S.legT[0] + "," + S.legT[1]] = 1;
          }
          continue;
        }
        var rsc = enemyDist(rs, rs.px, rs.py) * 10;
        if (cand === S.path[0]) rsc += 12;
        if (cand === null) rsc += 2;
        if (S.legT) rsc -= Math.abs(rs.px - S.legT[0]) + Math.abs(rs.py - S.legT[1]) * 0.5;
        if (rsc > pickScore) { pickScore = rsc; pick = cand; }
      }
      if (!pick) { // nothing survives: gamble on the best one-tick survivor
        S.rejections = 0;
        S.path = null; S.legT = null;
        var g = bestStep(st, 1);
        return go(g ? g.move : null);
      }
      if (pick === null) { S.waitStreak++; return go(null); }
      S.waitStreak = 0;
      return go(pick);
    }

    // calm mode: the next step plus a little settling must survive
    if (S.waitStreak > 25) { // caution has become paralysis: race whatever is there
      var rs2 = actionRollout(st, S.path[0], 1);
      S.waitStreak = 0;
      if (rs2) return go(S.path[0]);
    }
    var sim3 = tryRollout(st, S.path[0], CALM_IDLE, 2);
    if (!sim3) { // this step dies or jams down the line: ban it, take the next-best route
      S.rejections++;
      var bkey = st.px + "," + st.py + "," + (st.px + S.path[0][0]) + "," + (st.py + S.path[0][1]);
      S.rejCounts[bkey] = (S.rejCounts[bkey] || 0) + 1;
      S.banned[bkey] = 1;
      if (S.rejCounts[bkey] >= 2 && S.legT && st.g[S.legT[1]][S.legT[0]] !== X) {
        S.poison[S.legT[0] + "," + S.legT[1]] = 1;
      }
      if (S.rejections >= 12) { // boxed in: gamble on any step that survives this tick
        S.rejections = 0;
        S.banned = {}; S.rejCounts = {};
        S.path = null; S.legT = null;
        var g3 = bestStep(st, 1);
        S.waitStreak = 0;
        return go(g3 ? g3.move : null);
      }
      S.path = null; S.legT = null;
      S.waitStreak++;
      return go(null);
    }
    S.rejections = 0;
    return go(S.path[0]);
  }

  window.AIBOT = { reset: reset, decide: decide };
})();
