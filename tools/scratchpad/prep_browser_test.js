// prep_browser_test.js - make the instrumented copy of the game for Marionette testing
"use strict";
var fs = require("fs");
var path = require("path");

var dir = "/tmp/bh_test";
var main = fs.readFileSync(path.join(dir, "src", "main.js"), "utf8");
var m = main.replace(/^\(function \(\) \{/,
  "(function () {\n" +
  "  globalThis.__H = undefined; // set at the bottom\n");
if (m === main) throw new Error("IIFE opener not found");
m = m.replace(/\}\)\(\);\s*$/,
  "  globalThis.__H = {\n" +
  "    STATE: STATE, tick: tick, pressKey: pressKey,\n" +
  "    get mode(){return mode}, set mode(v){mode=v},\n" +
  "    get game(){return game}, set game(v){game=v},\n" +
  "    get st(){return st}, set st(v){st=v}\n" +
  "  };\n" +
  "})();\n");
if (m === main) throw new Error("IIFE closer not found");
fs.writeFileSync(path.join(dir, "src", "main.js"), m);

// audio instrumentation: log every Audio created, played, rejected, errored
var html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
var probe =
  "<script>\n" +
  "window.__log = [];\n" +
  "window.__OrigAudio = window.Audio;\n" +
  "class LogAudio extends window.__OrigAudio {\n" +
  "  constructor(src) {\n" +
  "    super(src);\n" +
  "    window.__log.push({ ev: 'new', src: src || '' });\n" +
  "    this.addEventListener('error', function () {\n" +
  "      window.__log.push({ ev: 'error', src: this.src, code: this.error ? this.error.code : -1 });\n" +
  "    });\n" +
  "  }\n" +
  "  play() {\n" +
  "    var self = this;\n" +
  "    window.__log.push({ ev: 'play', src: this.src });\n" +
  "    var p = super.play();\n" +
  "    if (p && p.catch) p.catch(function (e) {\n" +
  "      window.__log.push({ ev: 'REJECTED', src: self.src, why: String(e) });\n" +
  "    });\n" +
  "    return p;\n" +
  "  }\n" +
  "}\n" +
  "window.Audio = LogAudio;\n" +
  "</script>\n";
html = html.replace("<script src=\"src/engine.js\"></script>", probe + "<script src=\"src/engine.js\"></script>");
fs.writeFileSync(path.join(dir, "index.html"), html);
console.log("instrumented copy ready in /tmp/bh_test");
