(function () {
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var ovTitle = document.getElementById("ov-title");
  var ovMsg = document.getElementById("ov-msg");
  var hLevel = document.getElementById("h-level"), hDia = document.getElementById("h-dia"),
      hNeed = document.getElementById("h-need"), hTime = document.getElementById("h-time"),
      hScore = document.getElementById("h-score"), hLives = document.getElementById("h-lives");
  var STATE = { MENU: 0, PLAY: 1, PAUSE: 2, DEAD: 3, OVER: 4, DONE: 5, WIN: 6 };
  var mode = STATE.MENU, game = { level: 1, score: 0, lives: 3 }, st = null;
  var held = { l: false, r: false, u: false, d: false };
  var queue = []; // buffered taps, consumed one per tick, so quick presses are never lost
  function tap(dir) {
    if (mode !== STATE.PLAY) return;
    if (queue.length >= 2) queue.shift(); // when full, latest intent wins
    queue.push(dir);
  }
  var saveKey = "boulderdash100";

  function save() {
    try { localStorage.setItem(saveKey, JSON.stringify(game)); } catch (e) {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(saveKey)); } catch (e) { return null; }
  }

  function show(title, msg, color) {
    ovTitle.textContent = title; ovTitle.style.color = color || "#f55";
    ovMsg.innerHTML = msg;
    overlay.classList.remove("hidden");
  }
  function hide() { overlay.classList.add("hidden"); }

  function loadLevel(n) {
    st = mkState(genLevel(n));
    game.level = n;
  }
  function startLevel(n) { loadLevel(n); queue.length = 0; mode = STATE.PLAY; hide(); }

  function menu() {
    mode = STATE.MENU;
    var sv = load();
    var msg = "Dig through dirt. Push boulders. Collect diamonds.<br>" +
      "Grab enough diamonds to open the exit door, then step through.<br>" +
      "Falling boulders crush you, fireflies and butterflies alike.<br>" +
      "Butterflies burst into diamonds when crushed. Fireflies just burst.<br><br>" +
      "100 caves, each harder than the last.";
    if (sv && sv.level > 1) {
      msg += "<br><br><span style='color:#fff'>SPACE &mdash; new game &nbsp;|&nbsp; C &mdash; continue at cave " + sv.level + "</span>";
    } else {
      msg += "<br><br><span style='color:#fff'>SPACE &mdash; start</span>";
    }
    show("BOULDER HERMAN", msg, "#8f8");
  }

  function onDeath() {
    game.lives--;
    if (game.lives <= 0) {
      mode = STATE.OVER;
      save();
      show("GAME OVER", "The cave claimed another Herman.<br>Final score: " + game.score +
        "<br><br><span class='blink'>SPACE &mdash; back to menu</span>", "#f55");
    } else {
      mode = STATE.DEAD;
      show("SPLAT!", "Lives left: " + game.lives +
        "<br><br><span class='blink'>SPACE &mdash; retry cave " + game.level + "</span>", "#fa0");
    }
  }

  function onComplete() {
    game.score += Math.floor(st.time) * 5;
    save();
    if (game.level >= 100) {
      mode = STATE.WIN;
      show("YOU WIN!", "All 100 caves cleared. Herman can finally rest.<br>Final score: " + game.score +
        "<br><br><span class='blink'>SPACE &mdash; back to menu</span>", "#ff5");
      return;
    }
    mode = STATE.DONE;
    show("CAVE " + game.level + " CLEARED", "Time bonus: " + (Math.floor(st.time) * 5) +
      "<br>Score: " + game.score +
      "<br><br><span class='blink'>SPACE &mdash; enter cave " + (game.level + 1) + "</span>", "#5f5");
  }

  function tick() {
    if (mode !== STATE.PLAY || !st) return;
    var dx = 0, dy = 0;
    var t = queue.shift();
    if (t) {
      if (t === "l") dx -= 1;
      else if (t === "r") dx += 1;
      else if (t === "u") dy -= 1;
      else if (t === "d") dy += 1;
    } else {
      if (held.l) dx -= 1;
      if (held.r) dx += 1;
      if (held.u) dy -= 1;
      if (held.d) dy += 1;
      if (dx !== 0) dy = 0;
    }
    if (dx !== 0 || dy !== 0) tryMove(st, dx, dy);
    if (st.dead || st.done) {
      st.done ? onComplete() : onDeath();
      return;
    }
    physics(st);
    if (st.dead) { onDeath(); return; }
    enemyStep(st);
    if (st.dead) { onDeath(); return; }
    st.time -= TICK / 1000;
    if (st.time <= 0) { explode(st, st.px, st.py, false); onDeath(); }
  }

  // ---- rendering ----
  function tileDirt(x, y) {
    ctx.fillStyle = "#6b4a2b";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = "#7d5936";
    ctx.fillRect(x + 2, y + 2, 3, 3); ctx.fillRect(x + 9, y + 6, 3, 3);
    ctx.fillRect(x + 5, y + 10, 3, 3); ctx.fillRect(x + 11, y + 12, 2, 2);
  }
  function tileSteel(x, y) {
    ctx.fillStyle = "#555";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = "#888";
    ctx.fillRect(x, y, TS, 3); ctx.fillRect(x, y, 3, TS);
    ctx.fillStyle = "#333";
    ctx.fillRect(x, y + TS - 3, TS, 3); ctx.fillRect(x + TS - 3, y, 3, TS);
  }
  function tileBrick(x, y) {
    ctx.fillStyle = "#8a3b2a";
    ctx.fillRect(x, y, TS, TS);
    ctx.strokeStyle = "#5c2418";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1);
    ctx.beginPath();
    ctx.moveTo(x, y + 8); ctx.lineTo(x + TS, y + 8);
    ctx.moveTo(x + 8, y); ctx.lineTo(x + 8, y + 8);
    ctx.moveTo(x + 4, y + 8); ctx.lineTo(x + 4, y + TS);
    ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 12, y + TS);
    ctx.stroke();
  }
  function tileRound(x, y, fill, edge) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x + TS / 2, y + TS / 2, TS / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(x + TS / 2 - 3, y + TS / 2 - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  function tileDiamond(x, y) {
    ctx.fillStyle = "#0ff";
    ctx.shadowColor = "#0ff"; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x + TS / 2, y + 2); ctx.lineTo(x + TS - 3, y + TS / 2);
    ctx.lineTo(x + TS / 2, y + TS - 2); ctx.lineTo(x + 3, y + TS / 2);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.moveTo(x + TS / 2, y + 4); ctx.lineTo(x + TS / 2 + 3, y + TS / 2);
    ctx.lineTo(x + TS / 2, y + TS / 2 + 2); ctx.closePath(); ctx.fill();
  }
  function tileExit(x, y, open, t) {
    ctx.fillStyle = open ? (Math.floor(t * 6) % 2 ? "#fff" : "#fa0") : "#412";
    ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4);
    ctx.strokeStyle = "#803";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, TS - 4, TS - 4);
    if (open) { ctx.fillStyle = "#000"; ctx.fillRect(x + 7, y + 7, 2, 5); }
  }
  function tileFly(x, y, t, type) {
    var c = type === F ? "#f40" : "#dd0";
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x + TS / 2, y + 3); ctx.lineTo(x + TS - 3, y + TS / 2);
    ctx.lineTo(x + TS / 2, y + TS - 3); ctx.lineTo(x + 3, y + TS / 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#000";
    var s = 1 + (Math.floor(t * 8) % 2);
    ctx.fillRect(x + TS / 2 - 4, y + TS / 2 - s, 2, 2 * s);
    ctx.fillRect(x + TS / 2 + 2, y + TS / 2 - s, 2, 2 * s);
  }
  function tileHerman(x, y, t) {
    ctx.fillStyle = "#cfd2c8";
    ctx.beginPath();
    ctx.ellipse(x + TS / 2, y + TS / 2 + 1, 7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.ellipse(x + TS / 2 - 3, y + 6, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(x + TS / 2 + 3, y + 6, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f22";
    ctx.fillRect(x + TS / 2 - 3, y + 6, 1.5, 1.5);
    ctx.fillRect(x + TS / 2 + 3, y + 6, 1.5, 1.5);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + TS / 2, y + 8, 3.5, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + TS / 2 - 3, y + 10, 1.5, 2);
    ctx.fillRect(x + TS / 2 + 1.5, y + 10, 1.5, 2);
  }

  function render(t) {
    if (!st) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W * TS, H * TS);
    var open = st.collected >= st.needed;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var tt = st.g[y][x], px = x * TS, py = y * TS;
      if (tt === D) tileDirt(px, py);
      else if (tt === S) tileSteel(px, py);
      else if (tt === K) tileBrick(px, py);
      else if (tt === O) tileRound(px, py, "#8a8276", "#565049");
      else if (tt === M) tileDiamond(px, py);
      else if (tt === X) tileExit(px, py, open, t);
      else if (tt === F || tt === B) tileFly(px, py, t, tt);
    }
    if (mode === STATE.PLAY || mode === STATE.PAUSE) {
      tileHerman(st.px * TS, st.py * TS, t);
    }
    hLevel.textContent = game.level;
    hDia.textContent = st ? st.collected : 0;
    hNeed.textContent = st ? st.needed : 0;
    hTime.textContent = st ? Math.max(0, Math.ceil(st.time)) : 0;
    hScore.textContent = game.score;
    hLives.textContent = game.lives;
  }

  var last = performance.now();
  var tickAcc = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (mode === STATE.PLAY) {
      tickAcc += dt * 1000;
      while (tickAcc >= TICK) { tickAcc -= TICK; tick(); if (mode !== STATE.PLAY) break; }
    }
    render(now / 1000);
    requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].indexOf(k) >= 0) e.preventDefault();
    if (k === "ArrowLeft" || k === "a" || k === "A") { held.l = true; if (!e.repeat) tap("l"); }
    if (k === "ArrowRight" || k === "d" || k === "D") { held.r = true; if (!e.repeat) tap("r"); }
    if (k === "ArrowUp" || k === "w" || k === "W") { held.u = true; if (!e.repeat) tap("u"); }
    if (k === "ArrowDown" || k === "s" || k === "S") { held.d = true; if (!e.repeat) tap("d"); }
    if (k === " ") {
      if (mode === STATE.MENU) { game = { level: 1, score: 0, lives: 3 }; startLevel(1); }
      else if (mode === STATE.DEAD) { startLevel(game.level); }
      else if (mode === STATE.DONE) { startLevel(game.level + 1); }
      else if (mode === STATE.OVER || mode === STATE.WIN) { menu(); }
    }
    if ((k === "c" || k === "C") && mode === STATE.MENU) {
      var sv = load();
      if (sv && sv.level > 1) { game = sv; startLevel(sv.level); }
    }
    if (k === "p" || k === "P") {
      if (mode === STATE.PLAY) { mode = STATE.PAUSE; show("PAUSED", "<span class='blink'>P &mdash; resume</span>", "#ff0"); }
      else if (mode === STATE.PAUSE) { mode = STATE.PLAY; hide(); }
    }
    if ((k === "r" || k === "R") && mode === STATE.PLAY) { startLevel(game.level); }
  });
  document.addEventListener("keyup", function (e) {
    var k = e.key;
    if (k === "ArrowLeft" || k === "a" || k === "A") held.l = false;
    if (k === "ArrowRight" || k === "d" || k === "D") held.r = false;
    if (k === "ArrowUp" || k === "w" || k === "W") held.u = false;
    if (k === "ArrowDown" || k === "s" || k === "S") held.d = false;
  });

  menu();
  st = mkState(genLevel(1));
  requestAnimationFrame(loop);
})();
