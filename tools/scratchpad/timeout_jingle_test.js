// timeout_jingle_test.js - headless repro: does the game-over jingle fire on timeout?
// Loads engine.js + main.js into one scope with a stubbed DOM, then:
//   A) timeout with 3 lives  -> expect SPLAT (STATE.DEAD), no jingle
//   B) retry, timeout with 1 life -> expect GAME OVER (STATE.OVER) + jingle
//   C) direct onDeath with 1 life (control) -> expect jingle
"use strict";
var fs = require("fs");
var path = require("path");

var audioLog = []; // every Audio the game creates, in order

function StubCtx() {}
StubCtx.prototype.drawImage = function () {};
StubCtx.prototype.fillRect = function () {};
StubCtx.prototype.clearRect = function () {};
StubCtx.prototype.fillText = function () {};
StubCtx.prototype.save = function () {};
StubCtx.prototype.restore = function () {};
StubCtx.prototype.translate = function () {};
StubCtx.prototype.rotate = function () {};
StubCtx.prototype.scale = function () {};
StubCtx.prototype.beginPath = function () {};
StubCtx.prototype.closePath = function () {};
StubCtx.prototype.arc = function () {};
StubCtx.prototype.fill = function () {};
StubCtx.prototype.stroke = function () {};
StubCtx.prototype.moveTo = function () {};
StubCtx.prototype.lineTo = function () {};
StubCtx.prototype.setTransform = function () {};

function makeCtx() { // unknown methods no-op; data accessors return scratch buffers
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

function StubAudio(src) {
  this.src = src || "";
  this.volume = 1;
  this.loop = false;
  this.playbackRate = 1;
  this.currentTime = 0;
  this.duration = 180;
  audioLog.push({ ev: "new", src: this.src });
}
StubAudio.prototype.play = function () {
  audioLog.push({ ev: "play", src: this.src });
  return { catch: function () {} };
};
StubAudio.prototype.pause = function () { audioLog.push({ ev: "pause", src: this.src }); };
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

var els = {};
var doc = {
  getElementById: function (id) { if (!els[id]) els[id] = makeEl(id); return els[id]; },
  createElement: function () { return makeEl("dyn"); },
  addEventListener: function () {},
  body: { appendChild: function () {} }
};
var win = { innerWidth: 1280, innerHeight: 800, addEventListener: function () {} };
var perf = { now: function () { return perf.t; } };
perf.t = 0;
var store = {};
var storage = {
  getItem: function (k) { return (k in store) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};

var engine = fs.readFileSync(path.join(__dirname, "..", "..", "src", "engine.js"), "utf8");
var main = fs.readFileSync(path.join(__dirname, "..", "..", "src", "main.js"), "utf8");
// strip the outer IIFE so we can append an exports tail inside the same scope
var m = main.replace(/^\(function \(\) \{/, "").replace(/\}\)\(\);\s*$/, "");
if (m === main) throw new Error("IIFE wrapper not found/stripped");

var tail = "\n;globalThis.__H = {\n" +
  "  STATE: STATE, tick: tick, pressKey: pressKey, startLevel: startLevel, onDeath: onDeath,\n" +
  "  get mode(){return mode}, set mode(v){mode=v},\n" +
  "  get game(){return game}, set game(v){game=v},\n" +
  "  get st(){return st}, set st(v){st=v}\n" +
  "};\n";

var factory = new Function(
  "document", "window", "navigator", "performance", "localStorage",
  "Audio", "requestAnimationFrame", "setInterval", "clearInterval",
  "setTimeout", "clearTimeout", "getComputedStyle",
  engine + "\n" + m + tail
);

factory(doc, win, { getGamepads: function () { return []; } }, perf, storage,
  StubAudio, function () {}, function () { return 0; }, function () {},
  function () { return 0; }, function () {}, function () { return { fontSize: "15px" }; });

var H = globalThis.__H;
function log() { console.log.apply(console, arguments); }
function jingles() { return audioLog.filter(function (a) { return /game-over/.test(a.src) && a.ev === "play"; }); }

log("== load: mode =", H.mode, "(MENU expected:", H.STATE.MENU, ")");

// start a run from the main menu (menuSel 0 = START)
H.pressKey(" ");
log("== after SPACE: mode =", H.mode, "lives =", H.game.lives, "time =", H.st.time.toFixed(1));

// --- A: timeout with 3 lives -> expect SPLAT, no jingle
audioLog.length = 0;
H.st.time = 0.02;
var guard = 0;
while (H.mode === H.STATE.PLAY && guard++ < 50) H.tick();
log("A: mode =", H.mode, "(DEAD =", H.STATE.DEAD, ") title =", JSON.stringify(els["ov-title"].textContent),
    "jingle plays =", jingles().length);

// --- B: retry, timeout with 1 life left -> expect GAME OVER + jingle
H.pressKey(" "); // SPLAT retry
log("== retried: mode =", H.mode, "lives =", H.game.lives);
H.game.lives = 1;
audioLog.length = 0;
H.st.time = 0.02;
guard = 0;
while (H.mode === H.STATE.PLAY && guard++ < 50) H.tick();
log("B: mode =", H.mode, "(OVER =", H.STATE.OVER, ") title =", JSON.stringify(els["ov-title"].textContent),
    "jingle plays =", jingles().length);

// --- C: control - straight onDeath with 1 life
H.pressKey(" "); // leave the OVER screen back to the menu
H.pressKey(" "); // START a fresh run
H.game.lives = 1;
audioLog.length = 0;
H.onDeath();
log("C: mode =", H.mode, "(OVER =", H.STATE.OVER, ") title =", JSON.stringify(els["ov-title"].textContent),
    "jingle plays =", jingles().length);
