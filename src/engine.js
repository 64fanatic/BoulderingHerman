var W = 40, H = 22, TS = 16;
var E = " ", D = ".", S = "#", K = "B", O = "o", M = "*", X = "X", F = "F", B = "b";
var TICK = 140;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function genLevel(n) {
  var base = n * 7919 + 13;
  for (var att = 0; att < 400; att++) {
    var rnd = mulberry32(base + att * 104729 + 1);
    var g = [], x, y;
    for (y = 0; y < H; y++) {
      var row = [];
      for (x = 0; x < W; x++) {
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) row.push(S);
        else row.push(rnd() < 0.20 ? E : D);
      }
      g.push(row);
    }
    var clusters = 2 + Math.floor(rnd() * 4), c, i;
    for (c = 0; c < clusters; c++) {
      var cx = 2 + Math.floor(rnd() * (W - 4)), cy = 2 + Math.floor(rnd() * (H - 4));
      var len = 2 + Math.floor(rnd() * 5);
      var sx = cx, sy = cy;
      for (i = 0; i < len; i++) {
        if (g[sy] && g[sy][sx] !== undefined && g[sy][sx] !== S) g[sy][sx] = S;
        if (rnd() < 0.45) sx += rnd() < 0.5 ? -1 : 1; else sy += rnd() < 0.5 ? -1 : 1;
        sx = Math.max(1, Math.min(W - 2, sx)); sy = Math.max(1, Math.min(H - 2, sy));
      }
    }
    for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
      if (g[y][x] === S) continue;
      var r = rnd();
      if (r < 0.10) g[y][x] = O;
      else if (r < 0.13) g[y][x] = M;
      else if (r < 0.145) g[y][x] = K;
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
    var needed = Math.min(18, 3 + Math.floor(n / 6));
    if (!seen[ey][ex]) continue;
    if (reachD < needed + 3) {
      var cand = reachCells.filter(function (c2) { return g[c2[1]][c2[0]] === D; });
      while (reachD < needed + 3 && cand.length) {
        j = Math.floor(rnd() * cand.length);
        var cc = cand.splice(j, 1)[0];
        g[cc[1]][cc[0]] = M; reachD++;
      }
      if (reachD < needed + 3) continue;
    }
    var nf = Math.min(4, Math.floor(n / 18));
    var nb = Math.min(4, Math.max(0, Math.floor((n - 25) / 18)));
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
    var probe = mkState({ grid: g, px: px, py: py, ex: ex, ey: ey, needed: needed, time: 1 });
    var safe = true;
    for (var s = 0; s < 40; s++) {
      physics(probe);
      enemyStep(probe);
      if (probe.dead || probe.g[probe.py][probe.px] !== E) { safe = false; break; }
    }
    if (!safe) continue;
    var time = Math.max(80, 170 - Math.floor(n * 0.8));
    return { grid: g, px: px, py: py, ex: ex, ey: ey, needed: needed, time: time };
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
  return { grid: g2, px: 2, py: 2, ex: W - 3, ey: H - 3, needed: 5, time: 150 };
}

function mkState(data) {
  var g = data.grid.map(function (r) { return r.slice(); });
  var enemies = [];
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    if (g[y][x] === F) enemies.push({ x: x, y: y, dx: 1, dy: 0, type: F });
    else if (g[y][x] === B) enemies.push({ x: x, y: y, dx: -1, dy: 0, type: B });
  }
  return {
    g: g, px: data.px, py: data.py, ex: data.ex, ey: data.ey,
    needed: data.needed, time: data.time, collected: 0,
    enemies: enemies, dead: false, done: false
  };
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
  for (var y = H - 2; y >= 1; y--) {
    for (var x = 1; x < W - 1; x++) {
      var t = g[y][x];
      if (t !== O) continue; // only boulders fall; diamonds stay put
      if (moved[key(x, y)]) continue;
      var below = g[y + 1][x];
      if (below === E) {
        if (st.px === x && st.py === y + 1) { explode(st, x, y + 1, false); g[y][x] = E; continue; }
        g[y][x] = E; g[y + 1][x] = t; moved[key(x, y + 1)] = 1;
      } else if (below === F || below === B) {
        explode(st, x, y + 1, below === B);
        g[y][x] = E;
      } else if (below === O || below === M) {
        var pl = g[y][x - 1], plb = g[y + 1][x - 1];
        var pr = g[y][x + 1], prb = g[y + 1][x + 1];
        var atL = !(st.px === x - 1 && st.py === y);
        var atR = !(st.px === x + 1 && st.py === y);
        if (pl === E && plb === E && atL && (!atR || !(pr === E && prb === E) || Math.random() < 0.5)) {
          g[y][x] = E; g[y][x - 1] = t; moved[key(x - 1, y)] = 1;
        } else if (pr === E && prb === E && atR) {
          g[y][x] = E; g[y][x + 1] = t; moved[key(x + 1, y)] = 1;
        }
      }
    }
  }
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
  if (t === O && dy === 0) {
    var bx = nx + dx;
    if (st.g[ny][bx] === E) {
      st.g[ny][bx] = O; st.g[ny][nx] = E; st.px = nx; st.py = ny;
    }
    return;
  }
  if (t === F || t === B) { explode(st, st.px, st.py, false); st.dead = true; return; }
  if (t === X && st.collected >= st.needed) { st.done = true; return; }
}
