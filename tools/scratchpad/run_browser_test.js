// run_browser_test.js - one-shot: headless Firefox + Marionette + instrumented game copy.
// Kills any firefox it started, uses a fresh profile dir, prints the audio log.
"use strict";
var net = require("net");
var fs = require("fs");
var { spawn, execSync } = require("child_process");

function killFirefox() {
  try {
    var out = execSync("pgrep -x firefox || true").toString().trim();
    if (out) execSync("kill " + out.split("\n").join(" ") + " 2>/dev/null || true");
  } catch (e) {}
  execSync("sleep 1");
}
killFirefox();

var profDir = fs.mkdtempSync("/tmp/ffprof_test_");
var ff = spawn("firefox", [
  "--headless", "--marionette", "--no-remote", "--profile", profDir,
  "about:blank"
], { stdio: ["ignore", "ignore", "ignore"] });

var realSock = null, buf = "", msgId = 0, waiters = {};

function framed(d) {
  buf += d;
  var i;
  while ((i = buf.indexOf(":")) >= 0) {
    var len = parseInt(buf.slice(0, i), 10);
    if (isNaN(len) || buf.length < i + 1 + len) return;
    var msg = buf.slice(i + 1, i + 1 + len);
    buf = buf.slice(i + 1 + len);
    if (msg[0] !== "{") continue;
    var o = JSON.parse(msg);
    if (o.id === undefined) continue;
    var w = waiters[o.id];
    if (w) { delete waiters[o.id]; w(o); }
  }
}
function sendF(name, params) {
  return new Promise(function (resolve, reject) {
    var id = ++msgId;
    waiters[id] = function (o) {
      if (o.error) reject(new Error(name + ": " + JSON.stringify(o.error)));
      else resolve(o.value);
    };
    var payload = JSON.stringify([0, id, name, params || {}]);
    realSock.write(payload.length + ":" + payload);
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function waitPort(port, ms) {
  var t0 = Date.now();
  return new Promise(function check(resolve) {
    var p = net.connect(port, "127.0.0.1", function () { p.destroy(); resolve(true); });
    p.on("error", function () {
      if (Date.now() - t0 > ms) resolve(false); else setTimeout(function () { check(resolve); }, 300);
    });
  });
}
function pressSpace() {
  return sendF("WebDriver:PerformActions", {
    actions: [{ type: "key", id: "k1", actions: [
      { type: "keyDown", value: " " }, { type: "keyUp", value: " " }
    ] }]
  });
}

async function run() {
  var up = await waitPort(2828, 60000);
  if (!up) throw new Error("marionette never came up");
  realSock = net.connect(2828, "127.0.0.1");
  realSock.setEncoding("utf8");
  realSock.on("data", framed);
  await sleep(500);
  var hs = '{"marionetteProtocol":3}';
  realSock.write(hs.length + ":" + hs);
  await sendF("WebDriver:NewSession", {});
  console.log("session ok");

  await sendF("WebDriver:Navigate", { url: "file:///tmp/bh_test/index.html" });
  await sleep(2500);
  console.log("boot:", JSON.stringify(await sendF("WebDriver:ExecuteScript", {
    script: "return { mode: window.__H.mode, hasSt: !!window.__H.st };", args: []
  })));

  await pressSpace();
  await sleep(800);
  console.log("after SPACE:", JSON.stringify(await sendF("WebDriver:ExecuteScript", {
    script: "return { mode: window.__H.mode, time: window.__H.st.time };", args: []
  })));

  // timeout with 1 life left -> GAME OVER + jingle attempt
  await sendF("WebDriver:ExecuteScript", {
    script: "window.__H.game.lives = 1; window.__H.st.time = 0.05; window.__log.length = 0; return true;", args: []
  });
  await sleep(1200);
  var b = await sendF("WebDriver:ExecuteScript", {
    script: "return { mode: window.__H.mode, title: document.getElementById('ov-title').textContent, log: window.__log };", args: []
  });
  console.log("GAME OVER path:", JSON.stringify(b, null, 1));

  ff.kill("SIGTERM");
  process.exit(0);
}
run().catch(function (e) { console.error("FAIL:", e.message); ff.kill("SIGTERM"); process.exit(1); });
