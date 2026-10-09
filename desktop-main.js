// desktop-main.js - Electron harness: the game is plain files (index.html +
// src/ + assets/), this just gives it a window and stays out of the way.
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 760,
    minWidth: 700,
    minHeight: 520,
    backgroundColor: "#000000",
    title: "Bouldering Herman and the Sloppy Rocks",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile("index.html");
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
