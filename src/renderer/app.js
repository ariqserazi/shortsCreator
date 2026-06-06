(function () {
  "use strict"

  const api = window.shortsCreator
  const dom = {}
  let generatedFiles = []
  let saveTimer = null

  function init() {
    cacheDom()
    bindEvents()
    bindGenerationEvents()
    loadSettings()
  }

  function cacheDom() {
    dom.inputFolder = document.getElementById("inputFolder")
    dom.outputFolder = document.getElementById("outputFolder")
    dom.clipCount = document.getElementById("clipCount")
    dom.clipLength = document.getElementById("clipLength")
    dom.skipFirstSeconds = document.getElementById("skipFirstSeconds")
    dom.skipLastSeconds = document.getElementById("skipLastSeconds")
    dom.randomizeStartTimes = document.getElementById("randomizeStartTimes")
    dom.inputBrowseButton = document.getElementById("inputBrowseButton")
    dom.outputBrowseButton = document.getElementById("outputBrowseButton")
    dom.checkFfmpegButton = document.getElementById("checkFfmpegButton")
    dom.chooseFfmpegButton = document.getElementById("chooseFfmpegButton")
    dom.chooseFfprobeButton = document.getElementById("chooseFfprobeButton")
    dom.generateButton = document.getElementById("generateButton")
    dom.openOutputButton = document.getElementById("openOutputButton")
    dom.clearLogButton = document.getElementById("clearLogButton")
    dom.statusText = document.getElementById("statusText")
    dom.statusPill = document.getElementById("statusPill")
    dom.ffmpegSummary = document.getElementById("ffmpegSummary")
    dom.progressBar = document.getElementById("progressBar")
    dom.progressText = document.getElementById("progressText")
    dom.generatedList = document.getElementById("generatedList")
    dom.generatedCount = document.getElementById("generatedCount")
    dom.logOutput = document.getElementById("logOutput")
  }

  function bindEvents() {
    dom.inputBrowseButton.addEventListener("click", selectInputFolder)
    dom.outputBrowseButton.addEventListener("click", selectOutputFolder)
    dom.checkFfmpegButton.addEventListener("click", () => checkFfmpeg(true))
    dom.chooseFfmpegButton.addEventListener("click", chooseFfmpeg)
    dom.chooseFfprobeButton.addEventListener("click", chooseFfprobe)
    dom.generateButton.addEventListener("click", generateClips)
    dom.openOutputButton.addEventListener("click", openOutputFolder)
    dom.clearLogButton.addEventListener("click", clearLog)

    getSettingsInputs().forEach((element) => {
      element.addEventListener("input", queueSaveSettings)
      element.addEventListener("change", queueSaveSettings)
    })

    dom.outputFolder.addEventListener("change", refreshGeneratedListFromOutput)
  }

  function bindGenerationEvents() {
    api.onGenerationLog((message) => log(message))
    api.onGenerationStatus((message) => setStatus(message))
    api.onGenerationProgress((progress) => setProgress(progress.percent || 0, progress))
    api.onGenerationGenerated((filePath) => addGeneratedFile(filePath))
    api.onGenerationDone((result) => {
      generatedFiles = result.generatedFiles || generatedFiles
      renderGeneratedFiles()
      setStatus(`Finished. Created ${generatedFiles.length} clip(s).`)
      setProgress(100)
    })
    api.onGenerationError((message) => {
      setStatus("Generation failed")
      log(message, "error")
    })
    api.onGenerationState((state) => {
      setGeneratingState(Boolean(state && state.isGenerating))
    })
  }

  async function loadSettings() {
    try {
      const settings = await api.loadSettings()
      applySettings(settings)
      setStatus("Ready.")
      log("shortsCreator ready.")
      log("Choose input and output folders, then generate silent H.264 b-roll clips.")
      await checkFfmpeg(false)
      await refreshGeneratedListFromOutput()
    } catch (error) {
      setStatus("Could not load settings")
      log(error.message, "error")
    }
  }

  function getSettingsInputs() {
    return [
      dom.inputFolder,
      dom.outputFolder,
      dom.clipCount,
      dom.clipLength,
      dom.skipFirstSeconds,
      dom.skipLastSeconds,
      dom.randomizeStartTimes
    ]
  }

  function applySettings(settings) {
    dom.inputFolder.value = settings.inputFolder || ""
    dom.outputFolder.value = settings.outputFolder || ""
    dom.clipCount.value = settings.clipCount || 30
    dom.clipLength.value = settings.clipLength || 6
    dom.skipFirstSeconds.value = Number.isFinite(settings.skipFirstSeconds) ? settings.skipFirstSeconds : 90
    dom.skipLastSeconds.value = Number.isFinite(settings.skipLastSeconds) ? settings.skipLastSeconds : 90
    dom.randomizeStartTimes.checked = Boolean(settings.randomizeStartTimes)
  }

  function getSettings() {
    return {
      inputFolder: dom.inputFolder.value.trim(),
      outputFolder: dom.outputFolder.value.trim(),
      clipCount: Number(dom.clipCount.value),
      clipLength: Number(dom.clipLength.value),
      skipFirstSeconds: Number(dom.skipFirstSeconds.value),
      skipLastSeconds: Number(dom.skipLastSeconds.value),
      randomizeStartTimes: dom.randomizeStartTimes.checked
    }
  }

  function queueSaveSettings() {
    window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(async () => {
      try {
        await api.saveSettings(getSettings())
      } catch (error) {
        log(`Could not save settings: ${error.message}`, "warning")
      }
    }, 180)
  }

  async function selectInputFolder() {
    const selectedFolder = await api.selectInputFolder(dom.inputFolder.value)

    if (selectedFolder) {
      dom.inputFolder.value = selectedFolder
      queueSaveSettings()
    }
  }

  async function selectOutputFolder() {
    const selectedFolder = await api.selectOutputFolder(dom.outputFolder.value)

    if (selectedFolder) {
      dom.outputFolder.value = selectedFolder
      queueSaveSettings()
      await refreshGeneratedListFromOutput()
    }
  }

  async function chooseFfmpeg() {
    const selectedFile = await api.selectFfmpeg("")

    if (selectedFile) {
      const result = await api.setFfmpegPath(selectedFile)
      showFfmpegResult(result, true)
    }
  }

  async function chooseFfprobe() {
    const selectedFile = await api.selectFfprobe("")

    if (selectedFile) {
      const result = await api.setFfprobePath(selectedFile)
      showFfmpegResult(result, true)
    }
  }

  async function checkFfmpeg(showLog) {
    try {
      const result = await api.checkFfmpeg(getSettings())
      showFfmpegResult(result, showLog)
      return result.ok
    } catch (error) {
      dom.ffmpegSummary.textContent = "FFmpeg check failed."
      log(error.message, "error")
      return false
    }
  }

  function showFfmpegResult(result, showLog) {
    if (result.ok) {
      dom.ffmpegSummary.textContent = `Ready. ffmpeg: ${result.ffmpegSource}; ffprobe: ${result.ffprobeSource}.`

      if (showLog) {
        log(result.message)
      }
      return
    }

    dom.ffmpegSummary.textContent = "FFmpeg or ffprobe is missing. Choose paths manually or install FFmpeg."

    if (showLog) {
      log(result.message, "warning")
    }
  }

  async function generateClips() {
    generatedFiles = []
    renderGeneratedFiles()
    setProgress(0)
    setStatus("Preparing generation...")
    log("Starting clip generation...")

    try {
      await api.generateClips(getSettings())
    } catch (error) {
      setStatus("Generation failed")
    }
  }

  async function openOutputFolder() {
    try {
      await api.openOutputFolder(dom.outputFolder.value.trim())
    } catch (error) {
      log(error.message, "error")
    }
  }

  async function refreshGeneratedListFromOutput() {
    const outputFolder = dom.outputFolder.value.trim()

    if (!outputFolder) {
      generatedFiles = []
      renderGeneratedFiles()
      return
    }

    try {
      generatedFiles = await api.scanOutput(outputFolder)
      renderGeneratedFiles()
    } catch (error) {
      generatedFiles = []
      renderGeneratedFiles()
    }
  }

  function setGeneratingState(isGenerating) {
    [
      dom.inputFolder,
      dom.outputFolder,
      dom.clipCount,
      dom.clipLength,
      dom.skipFirstSeconds,
      dom.skipLastSeconds,
      dom.randomizeStartTimes,
      dom.inputBrowseButton,
      dom.outputBrowseButton,
      dom.checkFfmpegButton,
      dom.chooseFfmpegButton,
      dom.chooseFfprobeButton,
      dom.generateButton,
      dom.openOutputButton
    ].forEach((element) => {
      element.disabled = isGenerating
    })

    dom.statusPill.textContent = isGenerating ? "Working" : "Ready"
  }

  function setStatus(message) {
    dom.statusText.textContent = message
  }

  function setProgress(percent, progress) {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0))
    dom.progressBar.style.width = `${safePercent}%`

    if (progress && progress.total) {
      dom.progressText.textContent = `${safePercent}% · ${progress.current} of ${progress.total}`
      return
    }

    dom.progressText.textContent = `${safePercent}%`
  }

  function addGeneratedFile(filePath) {
    generatedFiles.push(filePath)
    renderGeneratedFiles()
  }

  function renderGeneratedFiles() {
    dom.generatedList.innerHTML = ""
    dom.generatedCount.textContent = `${generatedFiles.length} ${generatedFiles.length === 1 ? "file" : "files"}`

    generatedFiles.forEach((filePath) => {
      const item = document.createElement("li")
      item.textContent = filePath
      dom.generatedList.appendChild(item)
    })
  }

  function log(message, level) {
    const line = document.createElement("div")
    const timestamp = new Date().toLocaleTimeString()
    line.className = `log-line${level ? ` ${level}` : ""}`
    line.textContent = `[${timestamp}] ${String(message)}`
    dom.logOutput.appendChild(line)
    dom.logOutput.scrollTop = dom.logOutput.scrollHeight
  }

  function clearLog() {
    dom.logOutput.innerHTML = ""
    setStatus("Log cleared.")
  }

  document.addEventListener("DOMContentLoaded", init)
})()
