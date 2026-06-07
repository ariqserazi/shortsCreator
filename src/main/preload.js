"use strict"

const { contextBridge, ipcRenderer } = require("electron")

const eventChannels = new Set([
  "generation:done",
  "generation:error",
  "generation:generated",
  "generation:log",
  "generation:progress",
  "generation:state",
  "generation:status"
])

function subscribe(channel, callback) {
  if (!eventChannels.has(channel) || typeof callback !== "function") {
    return () => {}
  }

  const listener = (event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld("shortsCreator", {
  loadSettings() {
    return ipcRenderer.invoke("settings:load")
  },
  saveSettings(settings) {
    return ipcRenderer.invoke("settings:save", settings)
  },
  listSystemFonts() {
    return ipcRenderer.invoke("fonts:list")
  },
  selectSourceVideo(defaultPath) {
    return ipcRenderer.invoke("dialog:select-source-video", {
      title: "Select Source Video",
      defaultPath
    })
  },
  selectOutputFolder(defaultPath) {
    return ipcRenderer.invoke("dialog:select-folder", {
      title: "Select Output Folder",
      defaultPath
    })
  },
  selectSrtFile(defaultPath) {
    return ipcRenderer.invoke("dialog:select-srt", {
      title: "Select SRT Subtitle File",
      defaultPath
    })
  },
  selectFfmpeg(defaultPath) {
    return ipcRenderer.invoke("dialog:select-tool", {
      title: "Select ffmpeg",
      defaultPath
    })
  },
  selectFfprobe(defaultPath) {
    return ipcRenderer.invoke("dialog:select-tool", {
      title: "Select ffprobe",
      defaultPath
    })
  },
  setFfmpegPath(filePath) {
    return ipcRenderer.invoke("ffmpeg:set-path", {
      tool: "ffmpeg",
      filePath
    })
  },
  setFfprobePath(filePath) {
    return ipcRenderer.invoke("ffmpeg:set-path", {
      tool: "ffprobe",
      filePath
    })
  },
  checkFfmpeg(settings) {
    return ipcRenderer.invoke("ffmpeg:check", settings)
  },
  readVideoInfo(settings) {
    return ipcRenderer.invoke("video:info", settings)
  },
  generateParts(settings) {
    return ipcRenderer.invoke("generation:start", settings)
  },
  scanOutput(outputFolder) {
    return ipcRenderer.invoke("generation:scan-output", outputFolder)
  },
  openOutputFolder(outputFolder) {
    return ipcRenderer.invoke("shell:open-output", outputFolder)
  },
  onGenerationLog(callback) {
    return subscribe("generation:log", callback)
  },
  onGenerationStatus(callback) {
    return subscribe("generation:status", callback)
  },
  onGenerationProgress(callback) {
    return subscribe("generation:progress", callback)
  },
  onGenerationGenerated(callback) {
    return subscribe("generation:generated", callback)
  },
  onGenerationDone(callback) {
    return subscribe("generation:done", callback)
  },
  onGenerationError(callback) {
    return subscribe("generation:error", callback)
  },
  onGenerationState(callback) {
    return subscribe("generation:state", callback)
  }
})
