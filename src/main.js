(function () {
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var ovTitle = document.getElementById("ov-title");
  var ovMsg = document.getElementById("ov-msg");
  var ovHint = document.getElementById("ov-hint");
  var hLevel = document.getElementById("h-level"), hDia = document.getElementById("h-dia"),
      hNeed = document.getElementById("h-need"), hTime = document.getElementById("h-time"),
      hScore = document.getElementById("h-score"), hLives = document.getElementById("h-lives"),
      hKeys = document.getElementById("h-keys"), hKNeed = document.getElementById("h-kneed"),
      hudKeys = document.getElementById("hud-keys");
  var hudBar = document.getElementById("hud"),
      frameEl = document.getElementById("frame");
  // scale the game in whole-number multiples only, so pixels stay crisp;
  // the biggest multiplier that fits the window wins. Re-checked every frame,
  // and only the styles for a new multiplier are ever written.
  var fitK = 0;
  function fit() {
    try {
      var chromeH = hudBar.offsetHeight + 36;
      // 16px of scaled frame overhang: 8 up (clearance so the border never
      // covers the HUD) and 8 down (border hangs below the canvas)
      var k = Math.max(1, Math.floor(Math.min(
        (window.innerWidth - 24) / canvas.width,
        (window.innerHeight - chromeH) / (canvas.height + 16))));
      if (k === fitK) return;
      fitK = k;
      canvas.style.width = canvas.width * k + "px";
      canvas.style.height = canvas.height * k + "px";
      hudBar.style.width = (canvas.width + 8) * k + "px";
      hudBar.style.marginBottom = 8 * k + "px"; // exactly the border overhang: no overlap, no gap
      hudBar.style.fontSize = 13 * k + "px";
      overlay.style.fontSize = 15 * k + "px";
      frameEl.style.left = -8 * k + "px";
      frameEl.style.top = -8 * k + "px";
      frameEl.style.width = (canvas.width + 16) * k + "px";
      frameEl.style.height = (canvas.height + 16) * k + "px";
      if (mode === STATE.MENU) renderMenu(); // keep the logo in step with the scale
    } catch (e) {}
  }
  window.addEventListener("resize", fit);
  // boulder sounds - original synthesized effects (see tools/make_sfx.py)
  // menu sounds - Kenney GameSynth assets (select_001/toggle_001)
  var SND = (function () {
    var last = {}, sfxGain = 1, stepGain = 1; // dB slider gains, applied live
    function play(file, vol, gap, wobble) {
      var now = performance.now();
      if (last[file] && now - last[file] < gap) return;
      last[file] = now;
      try {
        var a = new Audio(file);
        a.volume = Math.min(1, Math.max(0, vol));
        if (wobble) a.playbackRate = 0.85 + Math.random() * 0.3; // never the same step twice
        var p = a.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
    return {
      setSound: function (g) { sfxGain = g; },   // every effect except footsteps
      setStep: function (g) { stepGain = g; },   // footsteps answer only to their own slider
      move: function () { play("assets/sfx/roll.wav", 0.3 * sfxGain, 110); },
      thud: function () { play("assets/sfx/thud.wav", 0.5 * sfxGain, 120); },
      splat: function () { play("assets/sfx/splat.wav", 0.6 * sfxGain, 0); },
      step: function () { play("assets/sfx/footstep0" + (1 + Math.floor(Math.random() * 9)) + ".ogg", 0.15 * stepGain, 90, true); },
      select: function () { play("assets/sfx/select_001.ogg", 0.4 * sfxGain, 60); },
      confirm: function () { play("assets/sfx/toggle_001.ogg", 0.4 * sfxGain, 60); }
    };
  })();
  // Firefox throttles tabs it thinks are silent, and HDMI receivers drop the
  // audio stream once no samples flow. This keeps a WebAudio graph running with
  // an inaudible-but-nonzero output (~-68 dB, far below hearing over HDMI), so
  // the tab always counts as playing audio. Starts on first input (autoplay
  // policy) and resumes after the tab was hidden.
  var AUD = (function () {
    var ac = null;
    function wake() {
      try {
        if (!ac) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ac = new AC();
          var osc = ac.createOscillator();
          var g = ac.createGain();
          g.gain.value = 0.0004;
          osc.frequency.value = 55;
          osc.connect(g);
          g.connect(ac.destination);
          osc.start();
        }
        if (ac.state === "suspended") ac.resume();
      } catch (e) {}
    }
    return { wake: wake };
  })();
  document.addEventListener("pointerdown", AUD.wake);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) AUD.wake(); });
  // level music - one randomly picked mp3 from "assets/background audio" per
  // level, looped until the level changes; every loop restart fades in, and the
  // tail of the file fades out, so the loop point is never a hard cut.
  // Browsers can't list a folder on their own: drop new tracks in the folder,
  // then add their file name to `tracks`.
  var MUSIC = (function () {
    var dir = "assets/background audio/";
    var tracks = [
      "freesound_community-big-temlpe-cave-soundscape-fantasy-201117_0067-26818.mp3",
      "freesound_community-cave-background-sound-49440.mp3",
      "freesound_community-dungeon-air-6983.mp3"
    ];
    var VOL = 0.5, FADE = 2; // target volume, fade length in seconds
    var el = new Audio(), curTrack = null, level = -1, playing = false, tail = false, timer = null;
    function stopFade() { if (timer) { clearInterval(timer); timer = null; } }
    function fadeTo(target, done) {
      stopFade();
      var from = el.volume, t0 = performance.now();
      timer = setInterval(function () {
        var k = (performance.now() - t0) / (FADE * 1000);
        if (k >= 1) { el.volume = target; stopFade(); if (done) done(); return; }
        el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      }, 40);
    }
    function play() { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
    function pick() { // random track, never the same one twice in a row
      var t = tracks[Math.floor(Math.random() * tracks.length)];
      if (tracks.length > 1 && t === curTrack) t = tracks[(tracks.indexOf(t) + 1) % tracks.length];
      curTrack = t;
      tail = false;
      el.src = dir + t;
    }
    el.addEventListener("timeupdate", function () {
      if (playing && !tail && !timer && el.duration && el.duration - el.currentTime <= FADE) {
        tail = true;
        fadeTo(0); // the file is about to end: let it sink to silence
      }
    });
    el.addEventListener("ended", function () {
      if (!playing) return;
      tail = false;
      try { el.currentTime = 0; } catch (e) {}
      play();
      fadeTo(VOL); // ... and rise back up from silence
    });
    return {
      start: function (n) { // called on every level (re)start with the level number
        if (!playing) {
          playing = true;
          level = n;
          pick();
          el.volume = 0;
          play();
          fadeTo(VOL);
          return;
        }
        if (n === level) return; // same level (retry, restart): keep the loop running
        level = n;
        fadeTo(0, function () { // new level: out with the old, in with the new
          pick();
          try { el.currentTime = 0; } catch (e) {}
          play();
          fadeTo(VOL);
        });
      },
      stop: function () { // fade out and silence (game over, win)
        playing = false;
        tail = false;
        fadeTo(0, function () { try { el.pause(); el.currentTime = 0; } catch (e) {} });
      },
      pause: function () { fadeTo(0, function () { if (!playing) return; try { el.pause(); } catch (e) {} }); },
      resume: function () {
        if (!playing) return;
        stopFade();
        play();
        fadeTo(VOL);
      },
      volume: function (v) { // dB slider: takes over as fade target and current level
        VOL = v;
        stopFade();
        el.volume = Math.min(1, Math.max(0, v));
      }
    };
  })();
  // game over jingle - interruptible, so acting on the game over screen cuts it.
  // A fresh element per play, like SND: a page-load element whose first play()
  // fires outside a user gesture gets autoplay-blocked, and the swallowed
  // rejection was why the jingle never sounded.
  var OVER_SFX = (function () {
    var FILE = "assets/sfx/tuomas_data-game-over-39-199830.mp3";
    var vol = 0.7, el = null;
    return {
      play: function () {
        el = new Audio(FILE);
        el.volume = Math.min(1, Math.max(0, vol));
        var p = el.play();
        if (p && p.catch) p.catch(function () {});
      },
      cut: function () { if (el) { try { el.pause(); } catch (e) {} el = null; } },
      volume: function (v) { vol = Math.min(1, Math.max(0, v)); if (el) el.volume = vol; }
    };
  })();
  // audio settings - three dB sliders (music, sound, footsteps), persisted.
  // 0 dB is each channel's designed level, -48 dB is silence, steps of 2 dB.
  var AUDIO = (function () {
    var KEY = "boulderdash100audio", MIN = -48, STEP = 2;
    var vals = { music: 0, sound: 0, step: 0 };
    try {
      var sv = JSON.parse(localStorage.getItem(KEY));
      if (sv) for (var k in vals) if (typeof sv[k] === "number") vals[k] = Math.max(MIN, Math.min(0, sv[k]));
    } catch (e) {}
    function gain(db) { return db <= MIN ? 0 : Math.pow(10, db / 20); }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(vals)); } catch (e) {} }
    function apply() {
      MUSIC.volume(0.5 * gain(vals.music)); // 0.5 dB-relative: the designed music level
      SND.setSound(gain(vals.sound));
      SND.setStep(gain(vals.step));
      OVER_SFX.volume(0.7 * gain(vals.sound));
    }
    apply();
    return {
      MIN: MIN, STEP: STEP,
      get: function (k) { return vals[k]; },
      adjust: function (k, d) { // d in steps of STEP dB; saves and applies live
        vals[k] = Math.max(MIN, Math.min(0, vals[k] + d * STEP));
        save();
        apply();
      }
    };
  })();
  // rats - XPenguins-style eye candy patrolling the browser window border.
  // One more rat joins for every cave cleared, in one of three coats (grey,
  // darker ash, ginger) rolled at spawn. Rats run along the window's inner
  // edge; RNG makes them pause to stand up on their hind legs and look around,
  // glance about, or wipe their whiskers, or simply turn around. Rats that
  // touch bounce off each other, so a crowd jitters in place until idle times
  // and speeds disperse it.
  var RATS = (function () {
    var SC = 2, TICK = 1 / 30, MAX = 100, LEN = 24; // sprite scale, sim rate, cap, bump distance
    var cv = document.createElement("canvas"), g = cv.getContext("2d");
    cv.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:100;background:transparent;image-rendering:pixelated;";
    document.body.appendChild(cv);
    var PALS = [ // three coats: grey, darker ash, ginger
      { g: "#8f8f8f", d: "#5a5a5a", k: "#111111", w: "#dddddd", p: "#cc9999" },
      { g: "#6f6f6f", d: "#3c3c3c", k: "#111111", w: "#dddddd", p: "#cc9999" },
      { g: "#bd7136", d: "#7c431d", k: "#111111", w: "#dddddd", p: "#cc9999" }
    ];
    var ART = { // legs: 2px dark with pink feet; stand: upright on hind legs, glancing around
      runA: [
        "..........gg.",
        ".....gggggkg.",
        ".p..gggggggp.",
        "..p.ggggggg..",
        "..dd.....dd..",
        "..pp.....pp.."
      ],
      runB: [
        "..........gg.",
        ".....gggggkg.",
        ".p..gggggggp.",
        "..p.ggggggg..",
        "....dd.dd....",
        "....pp.pp...."
      ],
      look: [
        "..........gg.",
        ".....gggggwg.",
        ".p..gggggggp.",
        "..p.ggggggg..",
        "...dd...dd...",
        "...pp...pp..."
      ],
      wipe: [
        ".........dgg.",
        ".....gggggkg.",
        ".p..gggggggp.",
        "..p.ggggggg..",
        "...dd...dd...",
        "...pp...pp..."
      ],
      standA: [
        "..........gg.",
        ".........gkg.",
        ".........gggp",
        "........pgg..",
        "........gg...",
        ".......ggg...",
        "......dd.dd..",
        "..ppp.pp..pp."
      ],
      standB: [
        "..........gg.",
        ".........gwg.",
        ".........gggp",
        "........pgg..",
        "........gg...",
        ".......ggg...",
        "......dd.dd..",
        "..ppp.pp..pp."
      ]
    };
    var SPR = []; // SPR[coat][pose], one sprite set per coat
    for (var v = 0; v < PALS.length; v++) {
      SPR.push({});
      for (var name in ART) (function (rows, pal, set) {
        var c = document.createElement("canvas");
        c.width = rows[0].length; c.height = rows.length;
        var x = c.getContext("2d");
        rows.forEach(function (row, y) {
          for (var i = 0; i < row.length; i++) if (pal[row[i]]) { x.fillStyle = pal[row[i]]; x.fillRect(i, y, 1, 1); }
        });
        set[name] = c;
      })(ART[name], PALS[v], SPR[v]);
    }
    var rats = [], P = 0, inT = 5, inL = 13; // track perimeter, insets so feet rest on the window edge
    function layout() {
      var oP = P;
      cv.width = window.innerWidth; cv.height = window.innerHeight;
      P = 2 * (cv.width - 2 * inL) + 2 * (cv.height - 2 * inT);
      if (oP > 0) for (var i = 0; i < rats.length; i++) rats[i].s = (rats[i].s / oP) * P;
    }
    layout();
    window.addEventListener("resize", layout);
    function mod(s) { return ((s % P) + P) % P; }
    function pt(s) { // track position -> screen x, y and clockwise travel angle
      var w = cv.width, h = cv.height, top = w - 2 * inL, right = h - 2 * inT;
      s = mod(s);
      if (s < top) return { x: inL + s, y: inT, a: 0 };
      s -= top;
      if (s < right) return { x: w - inL, y: inT + s, a: Math.PI / 2 };
      s -= right;
      if (s < top) return { x: w - inL - s, y: h - inT, a: Math.PI };
      s -= top;
      return { x: inL, y: h - inT - s, a: Math.PI * 1.5 };
    }
    function spawn() {
      if (rats.length >= MAX || P <= 0) return;
      rats.push({
        s: Math.random() * P, dir: Math.random() < 0.5 ? 1 : -1,
        v: 55 + Math.random() * 40, // every rat runs at its own pace
        c: Math.floor(Math.random() * PALS.length), // coat: grey, ash or ginger
        st: "run", t: 0, f: 0
      });
    }
    function topUp(n) { // skipping ahead to cave n still earns the crowd it implies
      for (var i = rats.length; i < Math.min(n, MAX); i++) spawn();
    }
    function tick() {
      for (var i = 0; i < rats.length; i++) {
        var r = rats[i];
        r.t += TICK;
        if (r.st === "run") {
          r.s = mod(r.s + r.dir * r.v * TICK);
          r.f += TICK;
          var roll = Math.random();
          if (roll < 0.005) { // pause to idle: stand up, glance about, or wipe whiskers
            r.st = roll < 0.0015 ? "stand" : roll < 0.003 ? "look" : "wipe"; r.t = 0;
          }
          else if (roll < 0.008) r.dir = -r.dir; // or just turn around
        } else if (r.t > (r.st === "stand" ? 1.4 : 0) + 0.5 + Math.random() * 1.2) { r.st = "run"; r.t = 0; }
      }
      for (var i = 0; i < rats.length; i++) for (var j = i + 1; j < rats.length; j++) {
        var a = rats[i], b = rats[j];
        var ds = Math.abs(a.s - b.s); ds = Math.min(ds, P - ds);
        if (ds < LEN) { // a meeting of rats: both head back the way they came
          a.dir = -a.dir; b.dir = -b.dir;
          var push = (LEN - ds) / 2 + 0.5;
          if (a.st === "run") a.s = mod(a.s + a.dir * push);
          if (b.st === "run") b.s = mod(b.s + b.dir * push);
        }
      }
    }
    var acc = 0;
    function frame(dt) {
      acc += Math.min(dt, 0.1);
      while (acc >= TICK) { acc -= TICK; tick(); }
      g.clearRect(0, 0, cv.width, cv.height);
      for (var i = 0; i < rats.length; i++) {
        var r = rats[i], p = pt(r.s), set = SPR[r.c];
        var spr = r.st === "run" ? (Math.floor(r.f * 8) % 2 ? set.runB : set.runA)
          : r.st === "stand" ? (Math.floor(r.t * 4) % 2 ? set.standB : set.standA) // glances left and right
          : set[r.st];
        g.save();
        g.translate(p.x, p.y);
        g.rotate(r.dir > 0 ? p.a : p.a + Math.PI);
        g.scale(SC, SC * (r.dir > 0 ? -1 : 1)); // feet toward the window edge, either direction
        g.drawImage(spr, -spr.width / 2, -spr.height / 2);
        g.restore();
      }
    }
    return { spawn: spawn, topUp: topUp, frame: frame, reset: function () { rats.length = 0; } };
  })();
  var STATE = { MENU: 0, PLAY: 1, PAUSE: 2, DEAD: 3, OVER: 4, DONE: 5, WIN: 6, HELP: 7, AUDIO: 8, LEVELSEL: 9 };
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
    ovMsg.classList.remove("scrolling");
    ovMsg.innerHTML = msg;
    overlay.classList.remove("hidden");
  }
  function hide() { overlay.classList.add("hidden"); }

  function loadLevel(n) {
    st = mkState(genLevel(n));
    game.level = n;
  }
  function startLevel(n) { loadLevel(n); queue.length = 0; mode = STATE.PLAY; hide(); MUSIC.start(n); RATS.topUp(n); }

  var menuSel = 0, menuActs = [], helpOff = 0;
  function hint(txt) { ovHint.textContent = txt; }

  function menu() {
    mode = STATE.MENU;
    renderMenu();
  }

  function renderMenu() {
    var sv = load();
    var labels = [], acts = [];
    labels.push("START"); acts.push(function () { game = { level: 1, score: 0, lives: 3 }; RATS.reset(); startLevel(1); });
    if (sv && sv.level > 1) labels.push("CONTINUE AT CAVE " + sv.level), acts.push(function () { game = sv; startLevel(sv.level); });
    labels.push("LEVEL SELECT"); acts.push(showLevelSel);
    labels.push("AUDIO"); acts.push(showAudio);
    labels.push("INSTRUCTIONS"); acts.push(showHelp);
    if (menuSel >= labels.length) menuSel = 0;
    menuActs = acts;
    var html = "<img src='" + LOGO.url + "' style='width:" + (LOGO.w * LOGO_SCALE * fitK) +
      "px;image-rendering:pixelated;margin-bottom:" + (8 * fitK) + "px'>";
    for (var i = 0; i < labels.length; i++) {
      html += "<div style='color:" + (i === menuSel ? "#fff" : "#0f0") + ";line-height:1.9'>" +
        (i === menuSel ? "&raquo; " : "&nbsp;&nbsp;&nbsp;") + labels[i] + "</div>";
    }
    show("BOULDERING HERMAN AND THE SLOPPY ROCKS", html, "#0f0");
    hint("SPACE — SELECT");
  }

  function showHelp() {
    mode = STATE.HELP;
    helpOff = 0;
    show("INSTRUCTIONS",
      "<div id='help-scroll'>" +
      "Dig through dirt. Push boulders. Collect flowers.<br>" +
      "Grab enough flowers to open the exit door, then step through.<br>" +
      "Falling boulders crush you, fireflies and butterflies alike.<br>" +
      "Butterflies burst into flowers when crushed. Fireflies just burst.<br>" +
      "From cave 11 on, the door also demands 3 keys.<br>" +
      "100 caves, each harder than the last.<br><br>" +
      "<span style='color:#fff'>MOVE — arrow keys or WASD</span><br>" +
      "<span style='color:#fff'>P — pause &nbsp;|&nbsp; R — restart cave</span><br>" +
      "<span style='color:#fff'>SPACE — select &nbsp;|&nbsp; ESC — back</span><br>" +
      "<span style='color:#fff'>GAMEPAD — stick/D-pad moves, A selects, B backs out,</span><br>" +
      "<span style='color:#fff'>Start pauses, Select restarts the cave</span>" +
      "</div>", "#ff0");
    ovMsg.classList.add("scrolling");
    scrollHelp(0);
    hint("ESC — BACK");
  }

  function scrollHelp(d) { // scroll by whole lines; clamped to the content
    var inner = document.getElementById("help-scroll");
    if (!inner) return;
    var max = Math.max(0, inner.scrollHeight - ovMsg.clientHeight);
    var step = Math.ceil(parseFloat(getComputedStyle(ovMsg).fontSize) * 1.7);
    helpOff = Math.max(0, Math.min(max, helpOff + d * step));
    inner.style.transform = "translateY(" + (-helpOff) + "px)";
  }

  // level select - a numpad-style 0-9 grid (plus C and GO) for picking any of
  // the 100 caves. Navigate with the movement keys, digits type directly.
  var levelSel = 0, levelEntry = "";
  var LEVEL_CELLS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "C", "0", "GO"];
  function showLevelSel() {
    mode = STATE.LEVELSEL;
    levelSel = 0; levelEntry = "";
    renderLevelSel();
  }
  function pressLevelCell(i) {
    var c = LEVEL_CELLS[i];
    if (c === "GO") {
      var n = parseInt(levelEntry, 10);
      if (!n) { SND.select(); return; } // nothing typed: nothing to start
      n = Math.min(100, Math.max(1, n));
      SND.confirm();
      game = { level: n, score: 0, lives: 3 }; // a warp is a fresh run
      RATS.reset();
      startLevel(n);
    } else if (c === "C") {
      SND.select(); levelEntry = ""; renderLevelSel();
    } else if (levelEntry.length < 3 && parseInt(levelEntry + c, 10) <= 100) {
      SND.select(); levelEntry += c; renderLevelSel();
    }
  }
  function renderLevelSel() {
    var html = "<div style='color:#fff;margin-bottom:" + (10 * fitK) + "px'>CAVE " +
      (levelEntry.length ? "<span style='color:#ff0'>" + levelEntry + "</span>" : "_") + " / 100</div>";
    for (var r = 0; r < 4; r++) {
      html += "<div style='line-height:1.9'>";
      for (var c = 0; c < 3; c++) {
        var i = r * 3 + c, sel = i === levelSel;
        html += "<span style='display:inline-block;width:33%;color:" + (sel ? "#fff" : "#0f0") + "'>" +
          (sel ? "&raquo; " : "&nbsp;&nbsp;") + LEVEL_CELLS[i] + "</span>";
      }
      html += "</div>";
    }
    show("LEVEL SELECT", html, "#ff0");
    hint("SPACE / A — PRESS | ESC / B — BACK");
  }

  // pause menu - resume, or bail out to the main menu. Quitting saves the run,
  // so CONTINUE AT CAVE picks it back up with the lives it had.
  var pauseSel = 0;
  function resume() { mode = STATE.PLAY; MUSIC.resume(); hide(); }
  function quitToMenu() {
    SND.confirm();
    save();
    MUSIC.stop();
    menu();
  }
  function showPause() { mode = STATE.PAUSE; MUSIC.pause(); pauseSel = 0; renderPause(); }
  function renderPause() {
    var items = ["RESUME", "QUIT TO MENU"];
    var html = "";
    for (var i = 0; i < items.length; i++) {
      html += "<div style='line-height:1.9;color:" + (i === pauseSel ? "#fff" : "#0f0") + "'>" +
        (i === pauseSel ? "&raquo; " : "&nbsp;&nbsp;") + items[i] + "</div>";
    }
    show("PAUSED", html, "#ff0");
    hint("SPACE — SELECT | ESC / P — RESUME");
  }

  var audioSel = 0;
  var AUDIO_ROWS = [["music", "MUSIC"], ["sound", "SOUND"], ["step", "FOOTSTEPS"]];
  function showAudio() {
    mode = STATE.AUDIO;
    renderAudio();
  }

  function renderAudio() { // three dB sliders, navigated and tuned with movement keys
    var span = -AUDIO.MIN, html = "";
    for (var i = 0; i < AUDIO_ROWS.length; i++) {
      var key = AUDIO_ROWS[i][0], db = AUDIO.get(key);
      var pos = Math.round((db - AUDIO.MIN) / span * 12); // 12-segment bar
      var bar = "";
      for (var s = 0; s < 12; s++) bar += s < pos ? "\u2588" : "\u2591";
      html += "<div style='line-height:2.1" + (i === audioSel ? ";color:#fff" : ";color:#0f0") + "'>" +
        (i === audioSel ? "&raquo; " : "&nbsp;&nbsp;&nbsp;") + AUDIO_ROWS[i][1] +
        "&nbsp; <span style='color:" + (i === audioSel ? "#ff0" : "#0a0") + "'>" + bar + "</span>" +
        "&nbsp; " + (db <= AUDIO.MIN ? "MUTE" : db + " dB") + "</div>";
    }
    html += "<br><span style='color:#fff'>&larr; &rarr; adjust &nbsp;|&nbsp; ESC &mdash; back</span>";
    show("AUDIO", html, "#ff0");
    hint("ESC — BACK");
  }

  function onDeath() {
    game.lives--;
    if (game.lives <= 0) {
      mode = STATE.OVER;
      MUSIC.stop();
      OVER_SFX.play();
      try { localStorage.removeItem(saveKey); } catch (e) {} // out of lives: the run is over, the save goes with it
      show("GAME OVER", "The cave claimed another Herman.<br>Final score: " + game.score +
        "<br><br><span class='blink'>SPACE &mdash; back to menu</span>", "#f00");
    } else {
      mode = STATE.DEAD;
      save(); // lives remaining persist: quitting here resumes at this cave with these lives
      show("SPLAT!", "Lives left: " + game.lives +
        "<br><br><span class='blink'>SPACE &mdash; retry cave " + game.level + "</span>", "#ff0");
    }
  }

  function onComplete() {
    game.score += Math.floor(st.time) * 5;
    save();
    RATS.spawn();
    if (game.level >= 100) {
      mode = STATE.WIN;
      MUSIC.stop();
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
    if (mode === STATE.PLAY && !st.squish) { // frozen: the boulder already has him
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

  // title-screen logo - just Herman's weird face, framed by a red royal robe:
  // frilly boulder-grey edge, curtain folds, a grey hem ring and a serrated
  // stone ruff collar around the face, like a rock about to smush him.
  var LOGO_SCALE = 6;
  var LOGO = (function () {
    var W = 34, H = 26, cx = 16.5, cy = 12.5;
    var rx = 16, ry = 11.5;   // robe ellipse
    var rxi = 11, ryi = 7.5;  // ruff collar ellipse
    var grid = [];
    for (var y = 0; y < H; y++) { grid.push([]); for (var x = 0; x < W; x++) grid[y].push("."); }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var dx = x - cx, dy = y - cy, ang = Math.atan2(dy, dx);
      var D = Math.sqrt(dx * dx / (rx * rx) + dy * dy / (ry * ry));
      var D2 = Math.sqrt(dx * dx / (rxi * rxi) + dy * dy / (ryi * ryi));
      var fringe = (Math.floor((ang + Math.PI) / (Math.PI / 7)) % 2) === 0;  // 14 fringe points
      var edge = fringe ? 1.0 : 0.86;
      var ruffPt = (Math.floor((ang + Math.PI) / (Math.PI / 5)) % 2) === 0;  // 10 ruff points
      var rEdge = ruffPt ? 1.0 : 0.82;
      var ch = null;
      if (D2 <= rEdge && D2 >= 0.68) {              // boulder ruff collar around the face
        ch = D2 > rEdge - 0.15 ? "A" : (((x + y) % 2) ? "a" : "A");
      } else if (D2 < 0.68 && D <= edge) {          // robe behind the face window
        if (Math.abs(D - 0.74) < 0.05) ch = "A";     // stone hem ring
        else if (Math.abs(D - 0.5) < 0.06 && (x + 3 * y) % 6 === 0) ch = "A"; // stone scrollwork
        else ch = ((x + y) % 7 === 0) ? "r" : "R";  // red drape with folds
      } else if (D <= edge) {                       // robe in front
        if (D > edge - 0.12) ch = "A";              // frilly boulder-grey edge
        else if (Math.abs(D - 0.74) < 0.05) ch = "A";
        else ch = ((x + y) % 7 === 0) ? "r" : "R";
      }
      if (ch) grid[y][x] = ch;
    }
    var head = HERMAN_ART.slice(0, 8); // the face, no body
    for (var y = 0; y < head.length; y++) for (var x = 0; x < head[y].length; x++) {
      if (head[y][x] !== ".") grid[9 + y][9 + x] = head[y][x];
    }
    var x0 = W, x1 = 0, y0 = H, y1 = 0; // crop to content
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (grid[y][x] !== ".") {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    var c = document.createElement("canvas");
    c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    var g = c.getContext("2d");
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var ch = grid[y][x];
      if (ch !== ".") { g.fillStyle = PAL[ch]; g.fillRect(x - x0, y - y0, 1, 1); }
    }
    return { url: c.toDataURL(), w: c.width, h: c.height, c: c };
  })();
  // the icon doubles as Herman's squish-by-boulder tile: the boulder-grey robe
  // reads as a rock flattening his face. Halved onto a tile, nearest-neighbor.
  var T_SQUISH = (function () {
    var c = document.createElement("canvas"); c.width = TS; c.height = TS;
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    var w2 = Math.round(LOGO.w / 2), h2 = Math.round(LOGO.h / 2);
    g.drawImage(LOGO.c, 0, Math.floor((TS - h2) / 2), w2, h2);
    return c;
  })();

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
      if (st.squish) { // boulder overhead: flash the squish tile over Herman, alternating per tick
        ctx.drawImage(st.squish.t % 2 ? T_SQUISH : T_HERMAN, st.px * TS, st.py * TS);
      } else ctx.drawImage(T_HERMAN, st.px * TS, st.py * TS);
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
    RATS.frame(dt);
    PAD.frame();
    requestAnimationFrame(loop);
  }

  // one key handler for two input sources: the keyboard and the gamepad
  // poller below, which feeds it synthetic keys.
  function pressKey(k, repeat) {
    if (k === "ArrowLeft" || k === "a" || k === "A") { held.l = true; if (!repeat) tap("l"); }
    if (k === "ArrowRight" || k === "d" || k === "D") { held.r = true; if (!repeat) tap("r"); }
    if (k === "ArrowUp" || k === "w" || k === "W") { held.u = true; if (!repeat) tap("u"); }
    if (k === "ArrowDown" || k === "s" || k === "S") { held.d = true; if (!repeat) tap("d"); }
    if (mode === STATE.MENU && !repeat) { // move between items with any movement key
      var prev = menuSel;
      if (k === "ArrowUp" || k === "ArrowLeft" || k === "w" || k === "W" || k === "a" || k === "A") {
        menuSel = (menuSel + menuActs.length - 1) % menuActs.length;
      } else if (k === "ArrowDown" || k === "ArrowRight" || k === "s" || k === "S" || k === "d" || k === "D") {
        menuSel = (menuSel + 1) % menuActs.length;
      }
      if (menuSel !== prev) { SND.select(); renderMenu(); }
    }
    if (mode === STATE.HELP) { // scroll the instructions with up/down
      if (k === "ArrowUp" || k === "w" || k === "W") { SND.select(); scrollHelp(-1); }
      else if (k === "ArrowDown" || k === "s" || k === "S") { SND.select(); scrollHelp(1); }
      else if (k === "Escape") { SND.confirm(); menu(); }
    }
    if (mode === STATE.AUDIO) { // sliders: up/down pick a row, left/right tune it
      if ((k === "ArrowUp" || k === "w" || k === "W") && !repeat) {
        audioSel = (audioSel + AUDIO_ROWS.length - 1) % AUDIO_ROWS.length;
        SND.select(); renderAudio();
      } else if ((k === "ArrowDown" || k === "s" || k === "S") && !repeat) {
        audioSel = (audioSel + 1) % AUDIO_ROWS.length;
        SND.select(); renderAudio();
      } else if (k === "ArrowLeft" || k === "a" || k === "A") {
        SND.select(); AUDIO.adjust(AUDIO_ROWS[audioSel][0], -1); renderAudio();
      } else if (k === "ArrowRight" || k === "d" || k === "D") {
        SND.select(); AUDIO.adjust(AUDIO_ROWS[audioSel][0], 1); renderAudio();
      } else if (k === "Escape") {
        SND.confirm(); menu();
      }
    }
    if (mode === STATE.LEVELSEL) { // numpad grid: move around it, or type digits directly
      var prevSel = levelSel;
      if (k === "ArrowUp" || k === "w" || k === "W") levelSel = (levelSel + 9) % 12;
      else if (k === "ArrowDown" || k === "s" || k === "S") levelSel = (levelSel + 3) % 12;
      else if (k === "ArrowLeft" || k === "a" || k === "A") levelSel = (levelSel + 11) % 12;
      else if (k === "ArrowRight" || k === "d" || k === "D") levelSel = (levelSel + 1) % 12;
      else if (k >= "0" && k <= "9" && !repeat && levelEntry.length < 3 && parseInt(levelEntry + k, 10) <= 100) {
        SND.select(); levelEntry += k; renderLevelSel();
      } else if (k === "Backspace" && !repeat) {
        SND.select(); levelEntry = levelEntry.slice(0, -1); renderLevelSel();
      } else if (k === " " && !repeat) {
        pressLevelCell(levelSel);
      } else if (k === "Escape") {
        SND.confirm(); menu();
      }
      if (levelSel !== prevSel) { SND.select(); renderLevelSel(); }
    }
    if (k === "Escape" && (mode === STATE.OVER || mode === STATE.WIN)) {
      SND.confirm(); OVER_SFX.cut(); menu(); // bail out of the end screen, back to the menu
    }
    if (k === " ") {
      if (mode === STATE.MENU) { SND.confirm(); menuActs[menuSel](); }
      else if (mode === STATE.DEAD) { SND.confirm(); startLevel(game.level); }
      else if (mode === STATE.DONE) { SND.confirm(); startLevel(game.level + 1); }
      else if (mode === STATE.OVER || mode === STATE.WIN) { SND.confirm(); OVER_SFX.cut(); menu(); }
    }
    if (mode === STATE.PAUSE) { // pause menu: RESUME or QUIT TO MENU
      var prevPause = pauseSel;
      if (k === "ArrowUp" || k === "ArrowLeft" || k === "w" || k === "W" || k === "a" || k === "A") pauseSel = 0;
      else if (k === "ArrowDown" || k === "ArrowRight" || k === "s" || k === "S" || k === "d" || k === "D") pauseSel = 1;
      else if (k === " " && !repeat) { if (pauseSel === 0) resume(); else quitToMenu(); }
      else if (k === "Escape") { SND.confirm(); resume(); }
      if (pauseSel !== prevPause) { SND.select(); renderPause(); }
    }
    if (k === "p" || k === "P") {
      if (mode === STATE.PLAY) showPause();
      else if (mode === STATE.PAUSE) resume();
    }
    if ((k === "r" || k === "R") && mode === STATE.PLAY) { startLevel(game.level); }
  }
  function releaseKey(k) {
    if (k === "ArrowLeft" || k === "a" || k === "A") held.l = false;
    if (k === "ArrowRight" || k === "d" || k === "D") held.r = false;
    if (k === "ArrowUp" || k === "w" || k === "W") held.u = false;
    if (k === "ArrowDown" || k === "s" || k === "S") held.d = false;
  }

  // gamepads - XInput and DirectInput controllers through the browser Gamepad
  // API (which is also what the Electron desktop build uses). No SDL needed:
  // it's zlib-licensed, so MIT-compatible, but native and redundant here; the
  // API already normalizes both pad families behind a standard button layout.
  // D-pad and left stick move and navigate; A is Space, B is Esc, Start is P,
  // Select is R. Pads appear after their first button press or connection.
  var PAD = (function () {
    var MAP = [ // standard gamepad layout
      { b: 0, k: " " },         // A (bottom face) -> select
      { b: 1, k: "Escape" },    // B (right face) -> back
      { b: 8, k: "r" },         // Select/Back -> restart cave
      { b: 9, k: "p" },         // Start -> pause
      { b: 12, k: "ArrowUp" },
      { b: 13, k: "ArrowDown" },
      { b: 14, k: "ArrowLeft" },
      { b: 15, k: "ArrowRight" }
    ];
    var was = {};
    function frame() {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      var gp = null;
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
      var now = {};
      if (gp) {
        for (var i = 0; i < MAP.length; i++) {
          var bt = gp.buttons[MAP[i].b];
          now[MAP[i].k] = !!(bt && (bt.pressed || bt.value > 0.5));
        }
        var ax = gp.axes; // the left stick doubles as the d-pad
        if (ax.length > 1) {
          if (ax[0] < -0.5) now.ArrowLeft = true;
          if (ax[0] > 0.5) now.ArrowRight = true;
          if (ax[1] < -0.5) now.ArrowUp = true;
          if (ax[1] > 0.5) now.ArrowDown = true;
        }
      }
      for (var key in was) if (was[key] && !now[key]) releaseKey(key); // includes pad unplugged
      for (var key in now) if (now[key] && !was[key]) pressKey(key, false);
      was = now;
    }
    return { frame: frame };
  })();

  document.addEventListener("keydown", function (e) {
    AUD.wake();
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].indexOf(e.key) >= 0) e.preventDefault();
    pressKey(e.key, e.repeat);
  });
  document.addEventListener("keyup", function (e) {
    releaseKey(e.key);
  });
  ovMsg.addEventListener("wheel", function (e) { // mouse scrolling on the instructions screen
    if (mode === STATE.HELP) { e.preventDefault(); scrollHelp(e.deltaY > 0 ? 3 : -3); }
  });

  menu();
  fit();
  st = mkState(genLevel(1));
  requestAnimationFrame(loop);
})();
