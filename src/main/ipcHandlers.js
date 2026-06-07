"use strict"

const path = require("node:path")
const { dialog, ipcMain, shell } = require("electron")
const { detectFfmpegTools } = require("../core/ffmpegTools")
const { scanGeneratedParts } = require("../core/filenameUtils")
const { readVideoInfo } = require("../core/videoInfo")
const { benchmarkVideoParts, generateVideoParts } = require("../core/videoProcessor")
const { isSupportedInputVideo } = require("../core/validation")
const { listSystemFonts } = require("../core/systemFonts")

function registerIpcHandlers(options) {
  const settingsStore = options.settingsStore
  const getMainWindow = options.getMainWindow
  const toolState = options.toolState
  let isGenerating = false

  function sendRendererEvent(channel, payload) {
    const mainWindow = getMainWindow()

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }

  function getSavedSettings() {
    return settingsStore.load()
  }

  function saveSettings(settings) {
    return settingsStore.save(settings)
  }

  async function checkFfmpeg(settings = getSavedSettings()) {
    const result = await detectFfmpegTools({
      ffmpegPath: settings.ffmpegPath,
      ffprobePath: settings.ffprobePath,
      renderPreset: settings.renderPreset,
      showTitleLabel: settings.showTitleLabel,
      captionSource: settings.captionSource
    })

    toolState.ffmpegPath = result.ffmpegPath
    toolState.ffprobePath = result.ffprobePath

    return result
  }

  ipcMain.handle("settings:load", () => getSavedSettings())

  ipcMain.handle("settings:save", (event, settings) => {
    return saveSettings(Object.assign({}, getSavedSettings(), settings || {}))
  })

  ipcMain.handle("fonts:list", () => {
    return listSystemFonts()
  })

  ipcMain.handle("dialog:select-folder", async (event, dialogOptions = {}) => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: dialogOptions.title || "Select Folder",
      defaultPath: dialogOptions.defaultPath || undefined,
      properties: ["openDirectory", "createDirectory"]
    })

    if (result.canceled || !result.filePaths.length) {
      return ""
    }

    return result.filePaths[0]
  })

  ipcMain.handle("dialog:select-source-video", async (event, dialogOptions = {}) => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: dialogOptions.title || "Select Source Video",
      defaultPath: dialogOptions.defaultPath || undefined,
      filters: [
        { name: "Video Files", extensions: ["mp4", "mov", "mkv", "avi", "m4v"] },
        { name: "All Files", extensions: ["*"] }
      ],
      properties: ["openFile"]
    })

    if (result.canceled || !result.filePaths.length) {
      return ""
    }

    const selectedFile = result.filePaths[0]

    if (!isSupportedInputVideo(selectedFile)) {
      throw new Error("Choose a supported video file: .mp4, .mov, .mkv, .avi, or .m4v.")
    }

    return selectedFile
  })

  ipcMain.handle("dialog:select-srt", async (event, dialogOptions = {}) => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: dialogOptions.title || "Select SRT Subtitle File",
      defaultPath: dialogOptions.defaultPath || undefined,
      filters: [
        { name: "SRT Subtitle Files", extensions: ["srt"] },
        { name: "All Files", extensions: ["*"] }
      ],
      properties: ["openFile"]
    })

    if (result.canceled || !result.filePaths.length) {
      return ""
    }

    return result.filePaths[0]
  })

  ipcMain.handle("dialog:select-tool", async (event, dialogOptions = {}) => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: dialogOptions.title || "Select FFmpeg Tool",
      defaultPath: dialogOptions.defaultPath || undefined,
      properties: ["openFile"]
    })

    if (result.canceled || !result.filePaths.length) {
      return ""
    }

    return result.filePaths[0]
  })

  ipcMain.handle("ffmpeg:check", async (event, settings) => {
    const savedSettings = saveSettings(Object.assign({}, getSavedSettings(), settings || {}))
    return checkFfmpeg(savedSettings)
  })

  ipcMain.handle("ffmpeg:set-path", async (event, payload = {}) => {
    const key = payload.tool === "ffprobe" ? "ffprobePath" : "ffmpegPath"
    const settings = settingsStore.update({
      [key]: payload.filePath || ""
    })

    return checkFfmpeg(settings)
  })

  ipcMain.handle("video:info", async (event, settings = {}) => {
    const savedSettings = saveSettings(Object.assign({}, getSavedSettings(), settings || {}))
    const tools = await checkFfmpeg(savedSettings)

    if (!tools.ok) {
      throw new Error(tools.message)
    }

    if (!savedSettings.sourceVideo) {
      throw new Error("Choose a source video first.")
    }

    return readVideoInfo(toolState.ffprobePath, savedSettings.sourceVideo)
  })

  ipcMain.handle("generation:scan-output", (event, outputFolder) => {
    if (!outputFolder) {
      return []
    }

    return scanGeneratedParts(outputFolder)
  })

  ipcMain.handle("generation:start", async (event, settings) => {
    if (isGenerating) {
      throw new Error("Generation is already running.")
    }

    isGenerating = true
    sendRendererEvent("generation:state", { isGenerating: true })

    try {
      const savedSettings = saveSettings(Object.assign({}, getSavedSettings(), settings || {}))
      const tools = await checkFfmpeg(savedSettings)

      if (!tools.ok) {
        throw new Error(tools.message)
      }

      const result = await generateVideoParts({
        settings: savedSettings,
        ffmpegPath: toolState.ffmpegPath,
        ffprobePath: toolState.ffprobePath,
        reporter: {
          log(message) {
            sendRendererEvent("generation:log", String(message))
          },
          status(message) {
            sendRendererEvent("generation:status", String(message))
          },
          progress(progress) {
            sendRendererEvent("generation:progress", progress)
          },
          generated(filePath) {
            sendRendererEvent("generation:generated", filePath)
          }
        }
      })

      sendRendererEvent("generation:done", result)
      return result
    } catch (error) {
      sendRendererEvent("generation:error", error.message)
      throw error
    } finally {
      isGenerating = false
      sendRendererEvent("generation:state", { isGenerating: false })
    }
  })

  ipcMain.handle("generation:benchmark", async (event, settings) => {
    if (isGenerating) {
      throw new Error("Generation is already running.")
    }

    isGenerating = true
    sendRendererEvent("generation:state", { isGenerating: true })

    try {
      const savedSettings = saveSettings(Object.assign({}, getSavedSettings(), settings || {}))
      const tools = await checkFfmpeg(savedSettings)

      if (!tools.ok) {
        throw new Error(tools.message)
      }

      const result = await benchmarkVideoParts({
        settings: savedSettings,
        ffmpegPath: toolState.ffmpegPath,
        ffprobePath: toolState.ffprobePath,
        reporter: {
          log(message) {
            sendRendererEvent("generation:log", String(message))
          },
          status(message) {
            sendRendererEvent("generation:status", String(message))
          },
          progress(progress) {
            sendRendererEvent("generation:progress", progress)
          },
          generated(filePath) {
            sendRendererEvent("generation:generated", filePath)
          }
        }
      })

      sendRendererEvent("generation:done", result)
      return result
    } catch (error) {
      sendRendererEvent("generation:error", error.message)
      throw error
    } finally {
      isGenerating = false
      sendRendererEvent("generation:state", { isGenerating: false })
    }
  })

  ipcMain.handle("shell:open-output", async (event, outputFolder) => {
    if (!outputFolder) {
      throw new Error("Choose an output folder first.")
    }

    const errorMessage = await shell.openPath(path.resolve(outputFolder))

    if (errorMessage) {
      throw new Error(errorMessage)
    }

    return true
  })
}

module.exports = {
  registerIpcHandlers
}
