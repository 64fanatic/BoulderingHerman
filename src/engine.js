var W = 40, H = 22, TS = 16;
var E = " ", D = ".", S = "#", K = "B", O = "o", M = "*", X = "X", F = "F", B = "b", KY = "y";
var TICK = 140;
var SQUISH_TICKS = 3; // a boulder landing on Herman hangs overhead this many ticks, so the squish flash reads

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// can the cave still be finished from (px,py): exit reachable, enough
// reachable flowers, and (past cave 10) all three keys
function winnable(G, px, py, ex, ey, needed, needKeys) {
  var seen = [], q = [[px, py]], flowers = 0, keys = 0;
  for (var y = 0; y < H; y++) seen.push(new Array(W).fill(false));
  seen[py][px] = true;
  while (q.length) {
    var p = q.pop(), dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var x2 = p[0] + dirs[i][0], y2 = p[1] + dirs[i][1];
      if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H || seen[y2][x2]) continue;
      var t = G[y2][x2];
      if (t === E || t === D || t === M || t === X || t === KY) {
        seen[y2][x2] = true; q.push([x2, y2]);
        if (t === M) flowers++;
        if (t === KY) keys++;
      }
    }
  }
  return seen[ey][ex] && flowers >= needed && keys >= needKeys;
}

// the time budget steps up with the cave's workload: flowers, brick walls and
// boulder density all grow with the cave number, so deeper caves get more clock
function levelTime(n) {
  return n <= 10 ? 60 : n <= 20 ? 90 : n <= 30 ? 120 : 164;
}

function genLevel(n) {
  var base = n * 7919 + 13;
  var needKeys = n > 10 ? 3 : 0; // from cave 11 the exit door demands three keys
  // difficulty scale: caves 1-28 ramp as tuned; 29-40 climb at roughly half
  // rate; past 40 the climb flattens again, so cave 100 tops out near the
  // old cave-51 ferocity
  var m = n <= 28 ? n : 28 + (Math.min(n, 40) - 28) * 0.55 + Math.max(0, n - 40) * 0.275;
  for (var att = 0; att < 400; att++) {
    var rnd = mulberry32(base + att * 104729 + 1);
    var g = [], x, y;
    for (y = 0; y < H; y++) {
      var row = [];
      for (x = 0; x < W; x++) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) row.push(S);
        else row.push(rnd() < 0.18 + Math.min(0.10, n * 0.001) ? E : D);
      }
      g.push(row);
    }
    var clusters = 2 + Math.floor(rnd() * 4) + Math.min(3, Math.floor(m / 25)), c, i; // more wall snakes deeper in
    for (c = 0; c < clusters; c++) {
      var cx = 2 + Math.floor(rnd() * (W - 4)), cy = 2 + Math.floor(rnd() * (H - 4));
      var len = 2 + Math.floor(rnd() * 5) + Math.min(4, Math.floor(m / 20)); // and longer ones, too
      var sx = cx, sy = cy;
      for (i = 0; i < len; i++) {
        if (g[sy] && g[sy][sx] !== undefined && g[sy][sx] !== S) g[sy][sx] = S;
        if (rnd() < 0.45) sx += rnd() < 0.5 ? -1 : 1; else sy += rnd() < 0.5 ? -1 : 1;
        sx = Math.max(1, Math.min(W - 2, sx)); sy = Math.max(1, Math.min(H - 2, sy));
      }
    }
    var bP = 0.11 + Math.min(0.10, m * 0.0012);      // boulders get denser...
    var kP = 0.015 + Math.min(0.12, m * 0.0015);     // ...and so do the brick walls
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      if (g[y][x] === S) continue;
      var r = rnd();
      if (r < bP) g[y][x] = O;
      else if (r < bP + 0.03) g[y][x] = M;
      else if (r < bP + 0.03 + kP) g[y][x] = K;
    }
    // lethal piles: vertical boulder stacks - solid rock, or dirt-plugged so
    // one careless dig underneath drops a boulder on the digger's head. The
    // original game loved these; their number grows with the cave number.
    var piles = Math.min(4, 1 + Math.floor(m / 12));
    for (i = 0; i < piles; i++) {
      var col = 2 + Math.floor(rnd() * (W - 4));
      var top = 2 + Math.floor(rnd() * (H - 8));
      var hgt = 3 + Math.floor(rnd() * 3); // 3-5 cells tall
      var solid = rnd() < 0.35;            // some piles are pure cascading rock
      var last = -1;
      for (var pi = 0; pi < hgt; pi++) {
        var yy = top + pi;
        if (yy >= H - 2 || g[yy][col] === S || g[yy][col] === K) break; // leave walls standing
        g[yy][col] = solid || pi % 2 === 0 ? O : D; // boulder, dirt, boulder...
        last = yy;
      }
      if (last >= 0 && g[last + 1] && g[last + 1][col] === E) g[last + 1][col] = D; // sure footing
    }
    var tries = 0, px = 3, py = 3;
    do { px = 2 + Math.floor(rnd() * (W - 4)); py = 2 + Math.floor(rnd() * (H - 4)); tries++; }
    while (tries < 200 && g[py][px] === S);
    if (g[py][px] === S) continue;
    var dx, dy;
    for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) g[py + dy][px + dx] = E;
    for (dy = -5; dy < -1; dy++) for (dx = -1; dx <= 1; dx++) {
      if (py + dy >= 1 && g[py + dy][px + dx] === O) g[py + dy][px + dx] = D;
    }
    var ex = -1, ey = -1, best = -1;
    for (i = 0; i < 120; i++) {
      var tx = 1 + Math.floor(rnd() * (W - 2)), ty = 1 + Math.floor(rnd() * (H - 2));
      if (g[ty][tx] === S) continue;
      var dist = Math.abs(tx - px) + Math.abs(ty - py);
      if (dist > best) { best = dist; ex = tx; ey = ty; }
    }
    if (ex < 0) continue;
    if (g[ey][ex] !== S) g[ey][ex] = X; else continue;
    var seen = [], q = [], reachD = 0, reachCells = [], j;
    for (y = 0; y < H; y++) seen.push(new Array(W).fill(false));
    seen[py][px] = true; q.push([px, py]);
    while (q.length) {
      var p = q.pop(), x2 = p[0], y2 = p[1];
      var dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (i = 0; i < 4; i++) {
        var x3 = x2 + dirs[i][0], y3 = y2 + dirs[i][1];
        if (x3 < 0 || y3 < 0 || x3 >= W || y3 >= H || seen[y3][x3]) continue;
        var t = g[y3][x3];
        if (t === E || t === D || t === M || t === X) {
          seen[y3][x3] = true; q.push([x3, y3]); reachCells.push([x3, y3]);
          if (t === M) reachD++;
        }
      }
    }
    // flower quota: +1 per cave from 5 up to the ceiling of 35 (reached at cave 31,
    // held through cave 35); after 35 the quota climbs again toward 40 with the cave
    var needed = n <= 35 ? Math.min(5 + (n - 1), 35)
      : Math.min(40, 33 + Math.floor((n - 36) / 10) + Math.floor(rnd() * 6)); // ceiling: 40
    // the cave holds exactly the quota plus a random 0..7 spare flowers
    var want = needed + Math.floor(rnd() * 8);
    if (!seen[ey][ex]) continue;
    if (reachD < want) {
      // deeper caves stash their flowers farther afield: more walking per petal
      var minD = Math.min(9, Math.floor(m / 8));
      var far = [], near = [];
      reachCells.forEach(function (c2) {
        if (g[c2[1]][c2[0]] !== D) return;
        (Math.abs(c2[0] - px) + Math.abs(c2[1] - py) >= minD ? far : near).push(c2);
      });
      while (reachD < want && (far.length || near.length)) {
        var src = far.length && (!near.length || rnd() < 0.8) ? far : near;
        j = Math.floor(rnd() * src.length);
        var cc = src.splice(j, 1)[0];
        g[cc[1]][cc[0]] = M; reachD++;
      }
      if (reachD < want) continue;
    } else if (reachD > want) {
      var spare = reachCells.filter(function (c2) { return g[c2[1]][c2[0]] === M; });
      while (reachD > want && spare.length) {
        j = Math.floor(rnd() * spare.length);
        var mc = spare.splice(j, 1)[0];
        g[mc[1]][mc[0]] = D; reachD--;
      }
    }
    // flowers sealed in unreachable pockets don't count toward the budget: trim
    // them too, so the cave holds exactly the quota plus its 0..7 spares
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      if (g[y][x] === M && !seen[y][x]) g[y][x] = D;
    }
    var nf = Math.min(5, Math.floor(m / 14));
    var nb = Math.min(5, Math.max(0, Math.floor((m - 20) / 14)));
    var spots = reachCells.filter(function (c2) {
      var gx = c2[0], gy = c2[1];
      return g[gy][gx] === E && Math.abs(gx - px) + Math.abs(gy - py) >= 6;
    });
    var ok = true;
    for (i = 0; i < nf + nb; i++) {
      if (!spots.length) { ok = false; break; }
      j = Math.floor(rnd() * spots.length);
      var sp = spots.splice(j, 1)[0];
      g[sp[1]][sp[0]] = i < nf ? F : B;
    }
    if (!ok) continue;
    // keys: from cave 11 the exit door demands three of them, hidden on reachable ground
    if (n > 10) {
      var keySpots = reachCells.filter(function (c2) {
        var gx = c2[0], gy = c2[1];
        return (g[gy][gx] === E || g[gy][gx] === D) && g[gy - 1][gx] === D &&
          Math.abs(gx - px) + Math.abs(gy - py) >= 5; // dirt lid: nothing can rest on a key
      });
      var placedKeys = 0;
      while (placedKeys < 3 && keySpots.length) {
        j = Math.floor(rnd() * keySpots.length);
        var ks = keySpots.splice(j, 1)[0];
        g[ks[1]][ks[0]] = KY;
        placedKeys++;
      }
      if (placedKeys < 3) continue;
    }
    // ambushes: boulders balanced on out-of-the-way flowers, waiting for greedy fingers
    var trapN = Math.min(3, Math.floor(m / 12));
    var flowerCells = reachCells.filter(function (c2) {
      return g[c2[1]][c2[0]] === M && Math.abs(c2[0] - px) + Math.abs(c2[1] - py) >= 8;
    });
    for (i = 0; i < trapN && flowerCells.length; i++) {
      j = Math.floor(rnd() * flowerCells.length);
      var mc = flowerCells.splice(j, 1)[0];
      var tx = mc[0], ty = mc[1];
      if (g[ty - 1][tx] === D && g[ty - 1][tx - 1] !== E && g[ty - 1][tx + 1] !== E) g[ty - 1][tx] = O;
    }
    // and one sniper boulder lurking in the column above the exit door
    if (n >= 15) {
      var ay = ey - 3;
      if (ay > 0 && g[ay][ex] === D && g[ay + 1][ex] !== E) g[ay][ex] = O;
    }
    var probe = mkState({ grid: g, px: px, py: py, ex: ex, ey: ey, needed: needed, time: 1 });
    var safe = true;
    for (var s = 0; s < 40; s++) {
      physics(probe);
      enemyStep(probe);
      if (probe.dead || probe.g[probe.py][probe.px] !== E) { safe = false; break; }
    }
    if (!safe) continue;
    // early enemy blasts and late boulder cascades both replay for real in
    // play, and both can eat flowers and keys or seal paths: the cave must
    // stay winnable on the post-probe grid and once fully settled
    if (!winnable(probe.g, px, py, ex, ey, needed, needKeys)) continue;
    var settled = mkState({ grid: g, px: px, py: py, ex: ex, ey: ey, needed: needed, time: 1 });
    for (var s2 = 0, calm = 0; s2 < 600 && calm < 3; s2++) calm = physics(settled).moved ? 0 : calm + 1;
    if (!winnable(settled.g, px, py, ex, ey, needed, needKeys)) continue;
    var time = levelTime(n);
    return { grid: g, px: px, py: py, ex: ex, ey: ey, needed: needed, time: time, needKeys: needKeys };
  }
  // Deterministic fallback cave (should almost never trigger)
  var fr = mulberry32(4242);
  var g2 = [], y2, x2;
  for (y2 = 0; y2 < H; y2++) {
    var row2 = [];
    for (x2 = 0; x2 < W; x2++) {
      if (x2 === 0 || y2 === 0 || x2 === W - 1 || y2 === H - 1) row2.push(S);
      else if ((x2 * 7 + y2 * 3) % 29 === 0) row2.push(O);
      else row2.push(D);
    }
    g2.push(row2);
  }
  for (i = 0; i < 12; i++) {
    var ddx = 5 + Math.floor(fr() * (W - 10)), ddy = 5 + Math.floor(fr() * (H - 10));
    g2[ddy][ddx] = M;
  }
  for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) g2[2 + dy][2 + dx] = E;
  g2[H - 3][W - 3] = X; g2[H - 3][W - 4] = E; g2[H - 4][W - 3] = E;
  return { grid: g2, px: 2, py: 2, ex: W - 3, ey: H - 3, needed: 5, time: levelTime(n) };
}

function mkState(data) {
  var g = data.grid.map(function (r) { return r.slice(); });
  var fall = [];
  for (var fy = 0; fy < H; fy++) fall.push(new Array(W).fill(false));
  var enemies = [];
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    if (g[y][x] === F) enemies.push({ x: x, y: y, dx: 1, dy: 0, type: F });
    else if (g[y][x] === B) enemies.push({ x: x, y: y, dx: -1, dy: 0, type: B });
  }
  return {
    g: g, px: data.px, py: data.py, ex: data.ex, ey: data.ey,
    needed: data.needed, time: data.time, collected: 0,
    keys: 0, needKeys: data.needKeys || 0,
    enemies: enemies, dead: false, done: false, squish: null,
    fall: fall // fall[y][x]: true while the boulder at (x,y) has momentum
  };
}

// the exit door unlocks only when the flower quota AND any demanded keys are in hand
function doorOpen(st) {
  return st.collected >= st.needed && st.keys >= (st.needKeys || 0);
}

function explode(st, x, y, dia) {
  for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
    var x2 = x + dx, y2 = y + dy;
    if (x2 <= 0 || y2 <= 0 || x2 >= W - 1 || y2 >= H - 1) continue;
    var t = st.g[y2][x2];
    if (t === S || t === X) continue;
    st.g[y2][x2] = dia ? M : E;
  }
  if (Math.abs(st.px - x) <= 1 && Math.abs(st.py - y) <= 1) st.dead = true;
}

function physics(st) {
  var g = st.g, moved = {}, key = function (x, y) { return y * W + x; };
  var ev = { moved: 0, thud: 0, crush: false };
  for (var y = H - 2; y >= 1; y--) {
    for (var x = 1; x < W - 1; x++) {
      var t = g[y][x];
      if (t !== O) continue; // only boulders fall; flowers and keys stay put
      if (moved[key(x, y)]) continue;
      var falling = st.fall[y][x];
      var below = g[y + 1][x];
      if (below === E) {
        if (st.px === x && st.py === y + 1) {
          if (falling) {
            // momentum carries the boulder into Herman: squash, no explosion.
            // The landing is held off for SQUISH_TICKS ticks so the squish
            // flash is visible; the UI freezes input while st.squish is set.
            if (!st.squish) st.squish = { x: x, y: y + 1, t: SQUISH_TICKS };
            else if (st.squish.x === x && st.squish.y === y + 1 && --st.squish.t <= 0) {
              st.squish = null;
              g[y][x] = E; g[y + 1][x] = O;
              st.fall[y][x] = false; st.fall[y + 1][x] = false;
              st.dead = true;
              ev.crush = true; ev.moved++;
            }
          }
          // else: a boulder dug free directly above Herman waits on his head;
          // it only starts falling once he steps out of the way
        } else {
          g[y][x] = E; g[y + 1][x] = t;
          st.fall[y][x] = false; st.fall[y + 1][x] = true;
          moved[key(x, y + 1)] = 1;
          ev.moved++;
        }
      } else if (below === F || below === B) {
        explode(st, x, y + 1, below === B);
        g[y][x] = E;
        st.fall[y][x] = false;
        ev.moved++;
      } else {
        // resting on an occupied tile
        if (falling) { st.fall[y][x] = false; ev.thud++; }
        if (below === O || below === M || below === KY) {
          // perched on something round: try to roll off it, one tile sideways;
          // after the roll it falls again next tick if the new spot is open below
          var pl = g[y][x - 1], plb = g[y + 1][x - 1];
          var pr = g[y][x + 1], prb = g[y + 1][x + 1];
          var atL = !(st.px === x - 1 && st.py === y);
          var atR = !(st.px === x + 1 && st.py === y);
          if (pl === E && plb === E && atL && (!atR || !(pr === E && prb === E) || Math.random() < 0.5)) {
            g[y][x] = E; g[y][x - 1] = t;
            st.fall[y][x - 1] = true;
            moved[key(x - 1, y)] = 1;
            ev.moved++;
          } else if (pr === E && prb === E && atR) {
            g[y][x] = E; g[y][x + 1] = t;
            st.fall[y][x + 1] = true;
            moved[key(x + 1, y)] = 1;
            ev.moved++;
          }
        }
      }
    }
  }
  return ev;
}

function enemyStep(st) {
  var g = st.g;
  var alive = [];
  for (var i = 0; i < st.enemies.length; i++) {
    var e = st.enemies[i];
    if (g[e.y][e.x] !== e.type) continue; // destroyed by explosion
    var left = { x: e.dy, y: -e.dx }, right = { x: -e.dy, y: e.dx };
    var back = { x: -e.dx, y: -e.dy };
    var order = e.type === F
      ? [left, { x: e.dx, y: e.dy }, right, back]
      : [right, { x: e.dx, y: e.dy }, left, back];
    var movedE = false;
    for (var j = 0; j < 4; j++) {
      var d = order[j];
      var nx = e.x + d.x, ny = e.y + d.y;
      if (nx <= 0 || ny <= 0 || nx >= W - 1 || ny >= H - 1) continue;
      if (st.px === nx && st.py === ny) { explode(st, st.px, st.py, false); movedE = true; break; }
      if (g[ny][nx] === E) {
        g[e.y][e.x] = E; g[ny][nx] = e.type;
        e.x = nx; e.y = ny; e.dx = d.x; e.dy = d.y;
        movedE = true; break;
      }
    }
    if (!movedE) { e.dx = back.x; e.dy = back.y; }
    alive.push(e);
  }
  st.enemies = alive;
}

function tryMove(st, dx, dy) {
  var nx = st.px + dx, ny = st.py + dy;
  var t = st.g[ny][nx];
  if (t === D || t === E) { st.g[ny][nx] = E; st.px = nx; st.py = ny; return; }
  if (t === M) { st.g[ny][nx] = E; st.px = nx; st.py = ny; st.collected++; return; }
  if (t === KY) { st.g[ny][nx] = E; st.px = nx; st.py = ny; st.keys++; return; }
  if (t === O && dy === 0) {
    var bx = nx + dx;
    if (st.g[ny][bx] === E) {
      st.g[ny][bx] = O; st.g[ny][nx] = E; st.px = nx; st.py = ny;
    }
    return;
  }
  if (t === F || t === B) { explode(st, st.px, st.py, false); st.dead = true; return; }
  if (t === X && doorOpen(st)) { st.done = true; return; }
}
