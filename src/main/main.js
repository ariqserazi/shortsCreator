"use strict"

const path = require("node:path")
const { app, BrowserWindow } = require("electron")
const { SettingsStore } = require("../core/settingsStore")
const { registerIpcHandlers } = require("./ipcHandlers")

const APP_NAME = "shortsCreator"

let mainWindow = null
const detectedTools = {
  ffmpegPath: "",
  ffprobePath: ""
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 920,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: "#0b1018",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once("ready-to-show", () => {
    mainWindow.show()
  })

  mainWindow.on("closed", () => {
    mainWindow = null
  })

  mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"))
}

app.setName(APP_NAME)

app.whenReady().then(() => {
  const settingsStore = new SettingsStore(app.getPath("userData"))

  registerIpcHandlers({
    settingsStore,
    toolState: detectedTools,
    getMainWindow() {
      return mainWindow
    }
  })

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
