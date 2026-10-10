// leaderboard_test.js - headless flow test for the arcade leaderboard.
"use strict";
var fs = require("fs");
var path = require("path");

function makeCtx() {
  return new Proxy({}, {
    get: function (t, p) {
      if (p in t) return t[p];
      if (p === "createImageData" || p === "getImageData")
        return function (a, b, w, h) {
          w = w || a; h = h || b;
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        };
      return function () {};
    },
    set: function (t, p, v) { t[p] = v; return true; }
  });
}
function StubAudio(src) { this.src = src || ""; this.volume = 1; this.loop = false; this.currentTime = 0; this.duration = 180; }
StubAudio.prototype.play = function () { return { catch: function () {} }; };
StubAudio.prototype.pause = function () {};
StubAudio.prototype.addEventListener = function () {};

function makeEl(id) {
  return {
    id: id, style: {}, textContent: "", innerHTML: "",
    classList: { add: function () {}, remove: function () {} },
    addEventListener: function () {}, appendChild: function () {},
    offsetHeight: 0, clientHeight: 0, scrollHeight: 0,
    width: 640, height: 352,
    toDataURL: function () { return "data:image/png;base64,"; },
    getContext: function () { return makeCtx(); }
  };
}

var engine = fs.readFileSync(path.join(__dirname, "..", "..", "src", "engine.js"), "utf8");
var main = fs.readFileSync(path.join(__dirname, "..", "..", "src", "main.js"), "utf8");
var m = main.replace(/^\(function \(\) \{/, "").replace(/\}\)\(\);\s*$/, "");
if (m === main) throw new Error("IIFE wrapper not stripped");
var tail = "\n;globalThis.__H = {\n" +
  "  STATE: STATE, tick: tick, pressKey: pressKey, startLevel: startLevel, onDeath: onDeath,\n" +
  "  get mode(){return mode}, set mode(v){mode=v},\n" +
  "  get game(){return game}, set game(v){game=v},\n" +
  "  get st(){return st}, set st(v){st=v}\n" +
  "};\n";

// fresh page: fresh DOM, fresh localStorage; seeded scores land before boot
function boot(seed) {
  var els = {};
  var doc = {
    getElementById: function (id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
    createElement: function () { return makeEl("dyn"); },
    addEventListener: function () {},
    body: { appendChild: function () {} }
  };
  var store = {};
  if (seed) for (var k in seed) store[k] = seed[k];
  var storage = {
    getItem: function (k) { return (k in store) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  };
  var factory = new Function(
    "document", "window", "navigator", "performance", "localStorage",
    "Audio", "requestAnimationFrame", "setInterval", "clearInterval",
    "setTimeout", "clearTimeout", "getComputedStyle",
    engine + "\n" + m + tail
  );
  factory(doc, { innerWidth: 1280, innerHeight: 800, addEventListener: function () {} },
    { getGamepads: function () { return []; } }, { now: function () { return 0; } }, storage,
    StubAudio, function () {}, function () { return 0; }, function () {},
    function () { return 0; }, function () {}, function () { return { fontSize: "15px" }; });
  return {
    H: globalThis.__H, els: els, store: store,
    title: function () { return els["ov-title"].textContent; },
    msg: function () { return els["ov-msg"].innerHTML; },
    board: function () { return store["boulderdash100board"] ? JSON.parse(store["boulderdash100board"]) : null; }
  };
}

var fails = 0;
function check(name, cond) {
  console.log((cond ? "PASS " : "FAIL ") + name);
  if (!cond) fails++;
}

// ---------- run 1: qualifying score ----------
var g = boot();
check("menu lists LEADERBOARD", /LEADERBOARD/.test(g.msg()));

g.H.pressKey(" "); // START
g.H.game.lives = 1;
g.H.game.score = 777;
g.H.st.time = 0.02;
var guard = 0;
while (g.H.mode === g.H.STATE.PLAY && guard++ < 50) g.H.tick();
check("timeout -> GAME OVER", g.H.mode === g.H.STATE.OVER && g.title() === "GAME OVER");
check("game over screen promises initials", /RECORD YOUR INITIALS/.test(g.msg()));
g.H.pressKey(" ");
check("SPACE -> initials entry", g.H.mode === g.H.STATE.ENTRY && g.title() === "NEW HIGH SCORE");

g.H.pressKey("j");
check("letter lands uppercased", /J/.test(g.msg()) && g.H.mode === g.H.STATE.ENTRY);
g.H.pressKey("3"); // digits ignored
g.H.pressKey("s");
g.H.pressKey("x");
check("third letter doesn't auto-commit", g.H.mode === g.H.STATE.ENTRY);
g.H.pressKey("Backspace"); // undo the x
g.H.pressKey("d"); // J S D
check("entry still open at 3 letters", g.H.mode === g.H.STATE.ENTRY);
g.H.pressKey(" "); // save
check("SPACE files the score", g.H.mode === g.H.STATE.BOARD && g.title() === "LEADERBOARD");
check("board highlights JSD 777", /JSD/.test(g.msg()) && /777/.test(g.msg()) && /#ff0/.test(g.msg()));
check("board persisted", JSON.stringify(g.board()) === JSON.stringify([{ name: "JSD", score: 777 }]));
g.H.pressKey(" ");
check("SPACE on board -> menu", g.H.mode === g.H.STATE.MENU);

// open LEADERBOARD from the menu (no save: START, LEVEL SELECT, LEADERBOARD, ...)
g.H.pressKey("ArrowDown");
g.H.pressKey("ArrowDown");
g.H.pressKey(" ");
check("menu opens the board", g.H.mode === g.H.STATE.BOARD && /JSD/.test(g.msg()));
g.H.pressKey("Escape");
check("ESC on board -> menu", g.H.mode === g.H.STATE.MENU);

// ESC on the entry screen skips recording
g.H.pressKey("ArrowUp"); // selection sits on LEADERBOARD; back up to START
g.H.pressKey("ArrowUp");
g.H.pressKey(" "); // START a fresh run
g.H.game.lives = 1;
g.H.game.score = 555;
g.H.st.time = 0.02;
guard = 0;
while (g.H.mode === g.H.STATE.PLAY && guard++ < 50) g.H.tick();
g.H.pressKey(" "); // -> entry (555 qualifies: board has 1 row)
check("second qualifying run -> entry", g.H.mode === g.H.STATE.ENTRY);
g.H.pressKey("Escape");
check("ESC on entry -> board, unsaved", g.H.mode === g.H.STATE.BOARD && !/555/.test(g.msg()) &&
  g.board().length === 1);

// ---------- run 2: board is full, score doesn't qualify ----------
var full = {};
full["boulderdash100board"] = JSON.stringify(
  Array.apply(null, Array(10)).map(function (_, i) { return { name: "AAA", score: 1000 + i }; }));
var g2 = boot(full);
g2.H.pressKey(" "); // START
g2.H.game.lives = 1;
g2.H.game.score = 5;
g2.H.st.time = 0.02;
guard = 0;
while (g2.H.mode === g2.H.STATE.PLAY && guard++ < 50) g2.H.tick();
check("game over without qualifying", g2.H.mode === g2.H.STATE.OVER && /BACK TO MENU/.test(g2.msg()));
g2.H.pressKey(" ");
check("SPACE skips straight to menu", g2.H.mode === g2.H.STATE.MENU);
check("board untouched", g2.board().length === 10 && g2.board()[9].name === "AAA");

// leaderboard menu item shows the seeded board
g2.H.pressKey("ArrowDown");
g2.H.pressKey("ArrowDown");
g2.H.pressKey(" ");
check("menu shows seeded board", g2.H.mode === g2.H.STATE.BOARD && /1\./.test(g2.msg()) && /1009/.test(g2.msg()));

process.exit(fails ? 1 : 0);
