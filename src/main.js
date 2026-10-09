(function () {
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var ovTitle = document.getElementById("ov-title");
  var ovMsg = document.getElementById("ov-msg");
  var hLevel = document.getElementById("h-level"), hDia = document.getElementById("h-dia"),
      hNeed = document.getElementById("h-need"), hTime = document.getElementById("h-time"),
      hScore = document.getElementById("h-score"), hLives = document.getElementById("h-lives"),
      hKeys = document.getElementById("h-keys"), hKNeed = document.getElementById("h-kneed"),
      hudKeys = document.getElementById("hud-keys");
  var hudBar = document.getElementById("hud"), h1El = document.querySelector("h1"),
      footEl = document.getElementById("foot"), frameEl = document.getElementById("frame");
  // scale the game in whole-number multiples only, so pixels stay crisp;
  // the biggest multiplier that fits the window wins. Re-checked every frame,
  // and only the styles for a new multiplier are ever written.
  var fitK = 0;
  function fit() {
    try {
      var chromeH = h1El.offsetHeight + hudBar.offsetHeight + footEl.offsetHeight + 36;
      var k = Math.max(1, Math.floor(Math.min(
        (window.innerWidth - 24) / canvas.width,
        (window.innerHeight - chromeH) / canvas.height)));
      if (k === fitK) return;
      fitK = k;
      canvas.style.width = canvas.width * k + "px";
      canvas.style.height = canvas.height * k + "px";
      hudBar.style.width = (canvas.width + 8) * k + "px";
      hudBar.style.fontSize = 13 * k + "px";
      overlay.style.fontSize = 15 * k + "px";
      frameEl.style.left = -8 * k + "px";
      frameEl.style.top = -8 * k + "px";
      frameEl.style.width = (canvas.width + 16) * k + "px";
      frameEl.style.height = (canvas.height + 16) * k + "px";
    } catch (e) {}
  }
  window.addEventListener("resize", fit);
  // boulder sounds - original synthesized effects (see tools/make_sfx.py)
  var SND = (function () {
    var last = {};
    function play(file, vol, gap, wobble) {
      var now = performance.now();
      if (last[file] && now - last[file] < gap) return;
      last[file] = now;
      try {
        var a = new Audio(file);
        a.volume = vol;
        if (wobble) a.playbackRate = 0.85 + Math.random() * 0.3; // never the same step twice
        var p = a.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
    return {
      move: function () { play("assets/sfx/roll.wav", 0.3, 110); },
      thud: function () { play("assets/sfx/thud.wav", 0.5, 120); },
      splat: function () { play("assets/sfx/splat.wav", 0.6, 0); },
      step: function () { play("assets/sfx/step.wav", 0.15, 90, true); }
    };
  })();
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
    ovTitle.textContent = title; ovTitle.style.color = color || "#f00";
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
    var msg = "Dig through dirt. Push boulders. Collect flowers.<br>" +
      "Grab enough flowers to open the exit door, then step through.<br>" +
      "Falling boulders crush you, fireflies and butterflies alike.<br>" +
      "Butterflies burst into flowers when crushed. Fireflies just burst.<br>" +
      "From cave 11 on, the door also demands 3 keys.<br><br>" +
      "100 caves, each harder than the last.";
    if (sv && sv.level > 1) {
      msg += "<br><br><span style='color:#fff'>SPACE &mdash; new game &nbsp;|&nbsp; C &mdash; continue at cave " + sv.level + "</span>";
    } else {
      msg += "<br><br><span style='color:#fff'>SPACE &mdash; start</span>";
    }
    show("BOULDER HERMAN", msg, "#0f0");
  }

  function onDeath() {
    game.lives--;
    if (game.lives <= 0) {
      mode = STATE.OVER;
      save();
      show("GAME OVER", "The cave claimed another Herman.<br>Final score: " + game.score +
        "<br><br><span class='blink'>SPACE &mdash; back to menu</span>", "#f00");
    } else {
      mode = STATE.DEAD;
      show("SPLAT!", "Lives left: " + game.lives +
        "<br><br><span class='blink'>SPACE &mdash; retry cave " + game.level + "</span>", "#ff0");
    }
  }

  function onComplete() {
    game.score += Math.floor(st.time) * 5;
    save();
    if (game.level >= 100) {
      mode = STATE.WIN;
      show("YOU WIN!", "All 100 caves cleared. Herman can finally rest.<br>Final score: " + game.score +
        "<br><br><span class='blink'>SPACE &mdash; back to menu</span>", "#ff0");
      return;
    }
    mode = STATE.DONE;
    show("CAVE " + game.level + " CLEARED", "Time bonus: " + (Math.floor(st.time) * 5) +
      "<br>Score: " + game.score +
      "<br><br><span class='blink'>SPACE &mdash; enter cave " + (game.level + 1) + "</span>", "#0f0");
  }

  function tick() {
    if (!st) return;
    var avalanche = mode === STATE.DEAD || mode === STATE.OVER;
    if (mode !== STATE.PLAY && !avalanche) return;
    if (mode === STATE.PLAY) {
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
      if (dx !== 0 || dy !== 0) {
        var ox = st.px, oy = st.py;
        tryMove(st, dx, dy);
        if (st.px !== ox || st.py !== oy) SND.step();
      }
      if (st.dead || st.done) {
        st.done ? onComplete() : onDeath();
        return;
      }
    }
    var ev = physics(st);
    if (ev.moved) SND.move();
    if (ev.thud) SND.thud();
    if (ev.crush) SND.splat();
    if (mode === STATE.PLAY) {
      if (st.dead) { onDeath(); return; }
      enemyStep(st);
      if (st.dead) { onDeath(); return; }
      st.time -= TICK / 1000;
      if (st.time <= 0) { explode(st, st.px, st.py, false); onDeath(); }
    } else {
      // behind the dimmed SPLAT screen the cave keeps going: avalanches are fair entertainment
      enemyStep(st);
    }
  }

  // ---- rendering ----
  // 16-color VGA style, tiles traced pixel-for-pixel from the classic look
  var PAL = {
    K: "#000", O: "#808000", R: "#800000", r: "#f00", G: "#0f0", g: "#008000",
    A: "#808080", a: "#646464", Y: "#ff0", N: "#000080", B: "#00f", W: "#f0f0f0", w: "#fff",
    S: "#f5918f", V: "#c000c0"
  };
  var DIRT_ART = [
    "KORYRgRrgORgRORO",
    "OrgRwRgOOgrRGrOK",
    "KOrGgOROROROgORg",
    "OROrOOrOrOOGrROK",
    "RYgOROgORORORORG",
    "KRgrOrOgrROrOrGr",
    "ROROgORORORORORK",
    "OROROrOrOGOROrOR",
    "KOrGRORORORrRGRr",
    "ORORrROGOrOGOrOK",
    "ROROOOrOROOrRGKO",
    "KROGrRGRORGRKrKR",
    "OOrOROrORrROrORK",
    "KRORrRORORKgKRKg",
    "KOOOROOrgKrOgKRO",
    "KRrROrORORgKOROK"
  ];
  var BRICK_ART = [
    "KKKKKKKKKKKKKKKK",
    "RrRKRrrRrRrKrrRr",
    "RRRKrRRrRRRKrRrR",
    "RRRKrRRRRRRKrRRR",
    "KKKKKKKKKKKKKKKK",
    "rrRrRrRKrrRrRrRK",
    "rRrRRRRKrRrRRRRK",
    "rRRRRRRKRRRRRRRK",
    "KKKKKKKKKKKKKKKK",
    "RrRKRrrRrRrKrrRr",
    "RRRKrRRrRRRKrRrR",
    "RRRKrRRRRRRKrRRR",
    "KKKKKKKKKKKKKKKK",
    "rrRrRrRKrrRrRrRK",
    "rRrRRRRKrRrRRRRK",
    "rRRRRRRKRRRRRRRK"
  ];
  var FLOWER_ART = [
    "KKNBNBNBNBNBNBKK",
    "KNBNBNBYYYBNBKBK",
    "NBKBNYYYYYYYNBKB",
    "BNBNYYrrrrrYYNBN",
    "NBNYYYrrrrrYYYNB",
    "BNBNYYrrrrrYYNBN",
    "NBNBNYYYYYYYNBNB",
    "BNBYBNBYYYBNYNBN",
    "NBYYNBNGGBBYYBNB",
    "YYrrYNBGGYYrrYBN",
    "NYrrYYNGGNYrrYYB",
    "BNYYBNBGGBBYYNBN",
    "NBYGNBNGGNBNGBNB",
    "BNBGBggGGggBGNBN",
    "KggGgggGGgggGggK",
    "KKggggggggggggKK"
  ];
  var KEY_ART = [
    "................",
    ".....KKKKK......",
    ".....KYYYK......",
    ".....KYKYK......",
    ".....KYKYK......",
    ".....KYYYK......",
    ".....KKKKK......",
    ".......KYK......",
    ".......KYK......",
    ".......KYK......",
    ".......KYKK.....",
    ".......KYK......",
    ".......KKK......",
    "................",
    "................",
    "................"
  ];
  var BOULDER_ART = [
    "KKKKAAKAAAAAKKKK",
    "KKKAKAAAAAKAAKKK",
    "KKAAAAAAAAAAKAKK",
    "KAAAAAAAAAAAAAAK",
    "AAAAAAAAAAAKAKAA",
    "AAAAAAAAAAAAAKAA",
    "AAAAAAAAAAAAKAAA",
    "AAAAAAAAAAAAAAAA",
    "AAAAAAAAAAKAAKAK",
    "AAAAAAAAAAAKKAKA",
    "AAAAAAAAAKAAKAAA",
    "AAAAAAAKAAAKAAKA",
    "KAAAAAKAKKAAKAAK",
    "KKAAAKAAKAKKAKKK",
    "KKKAAAAKAKAAAKKK",
    "KKKKAKAAKAKAKKKK"
  ];
  var HERMAN_ART = [
    "...wwwwKKwwww...",
    "...wwwwwwwwww...",
    "..wwBBBwwBBBww..",
    ".wwwBYBSSBYBwww.",
    "wwwwBBBKKBBBwwww",
    "wVVVVVVVVVVVVVVw",
    "wVKKKKwKwKwKKKVw",
    "wwVVKKKKKKKKVVww",
    "wwwVVVKwKwVVVwww",
    ".wwwVVVVVVVVwww.",
    "..wwwVVVVVVwww..",
    "...wwwwwwwwww...",
    "....wwwwwwww....",
    ".....wwwwww.....",
    "......wwww......",
    "................"
  ];
  var FLY_A = [
    "................",
    "...KKKKKKKKKK...",
    "..KrrrrrrrrrrK..",
    ".KrrrrrrrrrrrrK.",
    ".KrrKKrrrrKKrrK.",
    ".KrrWKrrrrKWrrK.",
    ".KrrrrrrrrrrrrK.",
    ".KrrrrrrrrrrrrK.",
    ".KrrrrrrrrrrrrK.",
    ".KrrrrrrrrrrrrK.",
    "..KrrrrrrrrrrK..",
    "...KKKKKKKKKK...",
    "................",
    "................",
    "................",
    "................"
  ];
  var FLY_B = [
    "................",
    "...KKKKKKKKKK...",
    "..KrrrrrrrrrrK..",
    ".KrrrrrrrrrrrrK.",
    ".KrrrrrrrrrrrrK.",
    ".KrrKKrrrrKKrrK.",
    ".KrrrrrrrrrrrrK.",
    ".KrrrrrrrrrrrrK.",
    ".KrrrrrrrrrrrrK.",
    ".KrrrrrrrrrrrrK.",
    "..KrrrrrrrrrrK..",
    "...KKKKKKKKKK...",
    "................",
    "................",
    "................",
    "................"
  ];
  var BUT_A = [
    "................",
    "...OOOOOOOOOO...",
    "..OYYYYYYYYYYO..",
    ".OYYYYYYYYYYYYO.",
    ".OYYKKYYYYKKYYO.",
    ".OYYKWYYYYKWYYO.",
    ".OYYYYYYYYYYYYO.",
    ".OYYYYYYYYYYYYO.",
    ".OYYYYYYYYYYYYO.",
    ".OYYYYYYYYYYYYO.",
    "..OYYYYYYYYYYO..",
    "...OOOOOOOOOO...",
    "................",
    "................",
    "................",
    "................"
  ];
  var BUT_B = [
    "................",
    "...OOOOOOOOOO...",
    "..OYYYYYYYYYYO..",
    ".OYYYYYYYYYYYYO.",
    ".OYYYYYYYYYYYYO.",
    ".OYYKKYYYYKKYYO.",
    ".OYYYYYYYYYYYYO.",
    ".OYYYYYYYYYYYYO.",
    ".OYYYYYYYYYYYYO.",
    ".OYYYYYYYYYYYYO.",
    "..OYYYYYYYYYYO..",
    "...OOOOOOOOOO...",
    "................",
    "................",
    "................",
    "................"
  ];
  var EXIT_LOCKED = [
    "................",
    ".KKKKKKKKKKKKK..",
    ".KAAAAAAAAAAAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaKaaAK..",
    ".KAaaaaaaKaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAAAAAAAAAAAK..",
    ".KKKKKKKKKKKKK..",
    "................",
    "................"
  ];
  var EXIT_LOCKED_KEYS = [
    "................",
    ".KKKKKKKKKKKKK..",
    ".KAAAAAAAAAAAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaKaKaKaaAK..",
    ".KAaaKaKaKaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAaaaaaaaaaAK..",
    ".KAAAAAAAAAAAK..",
    ".KKKKKKKKKKKKK..",
    "................",
    "................"
  ];
  var EXIT_YELLOW_A = [
    "................",
    ".KKKKKKKKKKKKK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYKYYYK..",
    ".KYYYYYYYKYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KYYYYYYYYYYYK..",
    ".KKKKKKKKKKKKK..",
    "................",
    "................"
  ];
  var EXIT_YELLOW_B = [
    "................",
    ".KKKKKKKKKKKKK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWKWWWK..",
    ".KWWWWWWWKWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KWWWWWWWWWWWK..",
    ".KKKKKKKKKKKKK..",
    "................",
    "................"
  ];
  var EXIT_RED_A = [
    "................",
    ".KKKKKKKKKKKKK..",
    ".KRRRRRRRRRRRK..",
    ".KRrrrrrrrrrRK..",
    ".KRrrrrrrrrrRK..",
    ".KRrrrrrrrrrRK..",
    ".KRrrrrrrrrrRK..",
    ".KRrrKrKrKrrRK..",
    ".KRrrKrKrKrrRK..",
    ".KRrrrrrrrrrRK..",
    ".KRrrrrrrrrrRK..",
    ".KRrrrrrrrrrRK..",
    ".KRRRRRRRRRRRK..",
    ".KKKKKKKKKKKKK..",
    "................",
    "................"
  ];
  var EXIT_RED_B = [
    "................",
    ".KKKKKKKKKKKKK..",
    ".KrrrrrrrrrrrK..",
    ".KrRRRRRRRRRrK..",
    ".KrRRRRRRRRRrK..",
    ".KrRRRRRRRRRrK..",
    ".KrRRRRRRRRRrK..",
    ".KrRRKRKRKRRrK..",
    ".KrRRKRKRKRRrK..",
    ".KrRRRRRRRRRrK..",
    ".KrRRRRRRRRRrK..",
    ".KrRRRRRRRRRrK..",
    ".KrrrrrrrrrrrK..",
    ".KKKKKKKKKKKKK..",
    "................",
    "................"
  ];
  function makeTile(art) {
    var c = document.createElement("canvas");
    c.width = TS; c.height = TS;
    var g = c.getContext("2d");
    for (var y = 0; y < art.length; y++) {
      for (var x = 0; x < art[y].length; x++) {
        var ch = art[y][x];
        if (ch === ".") continue;
        g.fillStyle = PAL[ch];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  var T_DIRT = makeTile(DIRT_ART), T_BRICK = makeTile(BRICK_ART), T_FLOWER = makeTile(FLOWER_ART),
      T_BOULDER = makeTile(BOULDER_ART), T_HERMAN = makeTile(HERMAN_ART),
      T_FLY = [makeTile(FLY_A), makeTile(FLY_B)], T_BUT = [makeTile(BUT_A), makeTile(BUT_B)],
      T_EXIT_L = makeTile(EXIT_LOCKED), T_EXIT_LK = makeTile(EXIT_LOCKED_KEYS),
      T_EXIT_Y = [makeTile(EXIT_YELLOW_A), makeTile(EXIT_YELLOW_B)],
      T_EXIT_R = [makeTile(EXIT_RED_A), makeTile(EXIT_RED_B)], T_KEY = makeTile(KEY_ART);

  function render(t) {
    if (!st) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W * TS, H * TS);
    var open = doorOpen(st), needKeys = st.needKeys > 0;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var tt = st.g[y][x], px = x * TS, py = y * TS;
      if (tt === D) ctx.drawImage(T_DIRT, px, py);
      else if (tt === S || tt === K) ctx.drawImage(T_BRICK, px, py);
      else if (tt === O) { ctx.drawImage(T_DIRT, px, py); ctx.drawImage(T_BOULDER, px, py); }
      else if (tt === M) ctx.drawImage(T_FLOWER, px, py);
      else if (tt === KY) ctx.drawImage(T_KEY, px, py);
      else if (tt === X) {
        if (!open) ctx.drawImage(needKeys ? T_EXIT_LK : T_EXIT_L, px, py);
        else if (needKeys) ctx.drawImage(T_EXIT_R[Math.floor(t * 6) % 2], px, py);
        else ctx.drawImage(T_EXIT_Y[Math.floor(t * 6) % 2], px, py);
      }
      else if (tt === F || tt === B) {
        var f = Math.floor(t * 8) % 2;
        ctx.drawImage(tt === F ? T_FLY[f] : T_BUT[f], px, py);
      }
    }
    if (mode === STATE.PLAY || mode === STATE.PAUSE) {
      ctx.drawImage(T_HERMAN, st.px * TS, st.py * TS);
    }
    hLevel.textContent = game.level;
    hDia.textContent = st ? st.collected : 0;
    hNeed.textContent = st ? st.needed : 0;
    hTime.textContent = st ? Math.max(0, Math.ceil(st.time)) : 0;
    hScore.textContent = game.score;
    hLives.textContent = game.lives;
    hKeys.textContent = st.keys;
    hKNeed.textContent = st.needKeys || 0;
    hudKeys.style.display = st.needKeys ? "" : "none";
  }

  var last = performance.now();
  var tickAcc = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var ticking = mode === STATE.PLAY || mode === STATE.DEAD || mode === STATE.OVER;
    if (ticking) {
      tickAcc += dt * 1000;
      while (tickAcc >= TICK) {
        tickAcc -= TICK;
        tick();
        if (mode !== STATE.PLAY && mode !== STATE.DEAD && mode !== STATE.OVER) { tickAcc = 0; break; }
      }
    }
    fit(); // cheap: only writes styles when the integer multiplier changes
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
  fit();
  st = mkState(genLevel(1));
  requestAnimationFrame(loop);
})();
