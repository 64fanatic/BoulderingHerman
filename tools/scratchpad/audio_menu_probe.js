// audio_menu_probe.js - verify the AUDIO menu columns line up and the block centers.
"use strict";
var net = require("net");
var s = net.connect(2828, "127.0.0.1");
s.setEncoding("utf8");
var buf = "", id = 0, pending = {};
function frame(msg) {
  var o = JSON.parse(msg);
  if (Array.isArray(o)) o = { id: o[1], error: o[2], value: o[3] };
  if (o.id === undefined) return;
  var cb = pending[o.id];
  if (cb) { delete pending[o.id]; cb(o); }
}
s.on("data", function (d) {
  buf += d;
  var i;
  while ((i = buf.indexOf(":")) >= 0) {
    var len = parseInt(buf.slice(0, i), 10);
    if (isNaN(len) || buf.length < i + 1 + len) return;
    var msg = buf.slice(i + 1, i + 1 + len);
    buf = buf.slice(i + 1 + len);
    if (msg[0] === "{" || msg[0] === "[") frame(msg);
  }
});
function send(name, params) {
  return new Promise(function (res, rej) {
    var my = ++id;
    pending[my] = function (o) { o.error ? rej(new Error(name + ": " + JSON.stringify(o.error))) : res(o.value); };
    var p = JSON.stringify([0, my, name, params || {}]);
    s.write(p.length + ":" + p);
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var started = false;
s.on("data", function h() { if (!started) { started = true; run(); } });

async function run() {
  console.log("run: newSession");
  await send("WebDriver:NewSession", {});
  console.log("run: navigate");
  await send("WebDriver:Navigate", { url: "file:///tmp/bh_test/index.html" });
  await sleep(2500);
  console.log("run: keys");
  // menu: START, LEVEL SELECT, LEADERBOARD, AUDIO (no save present) -> ArrowDown x3, SPACE
  // menu: START, LEVEL SELECT, LEADERBOARD, AUDIO (no save present)
  // Marionette's arrow-key actions hang headless, so drive pressKey directly
  for (var i = 0; i < 3; i++) {
    await send("WebDriver:ExecuteScript", { script: "window.__H.pressKey('ArrowDown'); return true;", args: [] });
    await sleep(150);
  }
  await send("WebDriver:ExecuteScript", { script: "window.__H.pressKey(' '); return true;", args: [] });
  await sleep(500);
  var v = await send("WebDriver:ExecuteScript", {
    script:
      "var cells = Array.prototype.slice.call(document.querySelectorAll('#ov-msg div[style*=table-cell]'));" +
      "function L(el){ return Math.round(el.getBoundingClientRect().left*100)/100; }" +
      "var table = document.querySelector('#ov-msg div[style*=inline-table]');" +
      "var msg = document.getElementById('ov-msg');" +
      "return {" +
      "  title: document.getElementById('ov-title').textContent," +
      "  labels: [cells[0],cells[3],cells[6]].map(L)," +
      "  bars:   [cells[1],cells[4],cells[7]].map(L)," +
      "  dbs:    [cells[2],cells[5],cells[8]].map(L)," +
      "  tableCenter: Math.round((table.getBoundingClientRect().left + table.getBoundingClientRect().right)/2)," +
      "  msgCenter: Math.round((msg.getBoundingClientRect().left + msg.getBoundingClientRect().right)/2)," +
      "  rows: ['MUSIC','SOUND','FOOTSTEPS'].map(function(t){ return cells.some(function(c){return c.textContent.indexOf(t)>=0;}); })" +
      "};",
    args: []
  });
  console.log(JSON.stringify(v.value, null, 1));
  var r = v.value;
  var okLabels = r.labels[0] === r.labels[1] && r.labels[1] === r.labels[2];
  var okBars = r.bars[0] === r.bars[1] && r.bars[1] === r.bars[2];
  var okDbs = r.dbs[0] === r.dbs[1] && r.dbs[1] === r.dbs[2];
  var okCenter = Math.abs(r.tableCenter - r.msgCenter) < 2;
  var indent = r.bars[0] > r.labels[0];
  console.log("labels aligned:", okLabels, "| bars aligned:", okBars, "| dB aligned:", okDbs,
    "| indent before bars:", indent, "| block centered:", okCenter);
  process.exit(okLabels && okBars && okDbs && okCenter && indent ? 0 : 1);
}
setTimeout(function () { console.log("STAGE TIMEOUT"); process.exit(1); }, 50000);
