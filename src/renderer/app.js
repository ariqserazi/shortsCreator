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
    [
      "sourceVideo",
      "outputFolder",
      "videoTitle",
      "splitMode",
      "segmentLength",
      "partCount",
      "overlapSeconds",
      "layoutMode",
      "crf",
      "captionSource",
      "captionStylePreset",
      "captionFontSize",
      "captionVerticalPosition",
      "srtFile",
      "sourceBrowseButton",
      "outputBrowseButton",
      "srtBrowseButton",
      "checkFfmpegButton",
      "chooseFfmpegButton",
      "chooseFfprobeButton",
      "generateButton",
      "openOutputButton",
      "clearLogButton",
      "statusText",
      "statusPill",
      "ffmpegSummary",
      "videoInfoText",
      "captionNote",
      "segmentLengthField",
      "partCountField",
      "srtFileField",
      "progressBar",
      "progressText",
      "generatedList",
      "generatedCount",
      "logOutput"
    ].forEach((id) => {
      dom[id] = document.getElementById(id)
    })
  }

  function bindEvents() {
    dom.sourceBrowseButton.addEventListener("click", selectSourceVideo)
    dom.outputBrowseButton.addEventListener("click", selectOutputFolder)
    dom.srtBrowseButton.addEventListener("click", selectSrtFile)
    dom.checkFfmpegButton.addEventListener("click", () => checkFfmpeg(true))
    dom.chooseFfmpegButton.addEventListener("click", chooseFfmpeg)
    dom.chooseFfprobeButton.addEventListener("click", chooseFfprobe)
    dom.generateButton.addEventListener("click", generateParts)
    dom.openOutputButton.addEventListener("click", openOutputFolder)
    dom.clearLogButton.addEventListener("click", clearLog)
    dom.splitMode.addEventListener("change", updateConditionalFields)
    dom.captionSource.addEventListener("change", updateConditionalFields)
    dom.sourceVideo.addEventListener("change", readSelectedVideoInfo)
    dom.outputFolder.addEventListener("change", refreshGeneratedListFromOutput)

    getSettingsInputs().forEach((element) => {
      element.addEventListener("input", queueSaveSettings)
      element.addEventListener("change", queueSaveSettings)
    })
  }

  function bindGenerationEvents() {
    api.onGenerationLog((message) => log(message))
    api.onGenerationStatus((message) => setStatus(message))
    api.onGenerationProgress((progress) => setProgress(progress.percent || 0, progress))
    api.onGenerationGenerated((filePath) => addGeneratedFile(filePath))
    api.onGenerationDone((result) => {
      generatedFiles = result.generatedFiles || generatedFiles
      renderGeneratedFiles()
      setStatus(`Finished. Created ${generatedFiles.length} video part(s).`)
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
      updateConditionalFields()
      setStatus("Ready.")
      log("shortsCreator ready.")
      log("Choose one source video, an output folder, split settings, and captions if needed.")
      await checkFfmpeg(false)
      await readSelectedVideoInfo()
      await refreshGeneratedListFromOutput()
    } catch (error) {
      setStatus("Could not load settings")
      log(error.message, "error")
    }
  }

  function getSettingsInputs() {
    return [
      dom.sourceVideo,
      dom.outputFolder,
      dom.videoTitle,
      dom.splitMode,
      dom.segmentLength,
      dom.partCount,
      dom.overlapSeconds,
      dom.layoutMode,
      dom.crf,
      dom.captionSource,
      dom.captionStylePreset,
      dom.captionFontSize,
      dom.captionVerticalPosition,
      dom.srtFile
    ]
  }

  function applySettings(settings) {
    dom.sourceVideo.value = settings.sourceVideo || ""
    dom.outputFolder.value = settings.outputFolder || ""
    dom.videoTitle.value = settings.videoTitle || ""
    dom.splitMode.value = settings.splitMode || "length"
    dom.segmentLength.value = settings.segmentLength || 60
    dom.partCount.value = settings.partCount || 5
    dom.overlapSeconds.value = Number.isFinite(settings.overlapSeconds) ? settings.overlapSeconds : 5
    dom.layoutMode.value = settings.layoutMode || "blurred"
    dom.crf.value = Number.isFinite(settings.crf) ? settings.crf : 22
    dom.captionSource.value = settings.captionSource || "none"
    dom.captionStylePreset.value = settings.captionStylePreset || "tiktok"
    dom.captionFontSize.value = settings.captionFontSize || 58
    dom.captionVerticalPosition.value = settings.captionVerticalPosition || 1450
    dom.srtFile.value = settings.srtFile || ""
  }

  function getSettings() {
    return {
      sourceVideo: dom.sourceVideo.value.trim(),
      outputFolder: dom.outputFolder.value.trim(),
      videoTitle: dom.videoTitle.value.trim(),
      splitMode: dom.splitMode.value,
      segmentLength: Number(dom.segmentLength.value),
      partCount: Number(dom.partCount.value),
      overlapSeconds: Number(dom.overlapSeconds.value),
      layoutMode: dom.layoutMode.value,
      crf: Number(dom.crf.value),
      captionSource: dom.captionSource.value,
      captionStylePreset: dom.captionStylePreset.value,
      captionFontSize: Number(dom.captionFontSize.value),
      captionVerticalPosition: Number(dom.captionVerticalPosition.value),
      srtFile: dom.srtFile.value.trim()
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

  function updateConditionalFields() {
    const splitByParts = dom.splitMode.value === "parts"
    const useSrt = dom.captionSource.value === "srt"
    const useAuto = dom.captionSource.value === "auto"

    dom.segmentLengthField.classList.toggle("muted-field", splitByParts)
    dom.partCountField.classList.toggle("muted-field", !splitByParts)
    dom.segmentLength.disabled = splitByParts
    dom.partCount.disabled = !splitByParts
    dom.srtFileField.classList.toggle("hidden", !useSrt)

    if (useAuto) {
      dom.captionNote.textContent = "Local Whisper-style transcription is prepared architecturally but not implemented in this version."
    } else if (useSrt) {
      dom.captionNote.textContent = "A full-video SRT file is sliced and offset for each generated part before burn-in."
    } else {
      dom.captionNote.textContent = "No captions will be burned in. The top title label is still added."
    }
  }

  async function selectSourceVideo() {
    try {
      const selectedFile = await api.selectSourceVideo(dom.sourceVideo.value)

      if (selectedFile) {
        dom.sourceVideo.value = selectedFile
        queueSaveSettings()
        await readSelectedVideoInfo()
      }
    } catch (error) {
      log(error.message, "error")
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

  async function selectSrtFile() {
    const selectedFile = await api.selectSrtFile(dom.srtFile.value)

    if (selectedFile) {
      dom.srtFile.value = selectedFile
      queueSaveSettings()
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

  async function readSelectedVideoInfo() {
    if (!dom.sourceVideo.value.trim()) {
      dom.videoInfoText.textContent = "No source video selected."
      return
    }

    try {
      const info = await api.readVideoInfo(getSettings())
      const duration = formatDuration(info.duration)
      dom.videoInfoText.textContent = `${duration} · ${info.width}x${info.height} · video: ${info.videoCodec || "unknown"} · audio: ${info.hasAudio ? info.audioCodec || "yes" : "none"}`
    } catch (error) {
      dom.videoInfoText.textContent = "Video info unavailable. Check FFmpeg/ffprobe and the selected file."
      log(error.message, "warning")
    }
  }

  async function generateParts() {
    generatedFiles = []
    renderGeneratedFiles()
    setProgress(0)
    setStatus("Preparing generation...")
    log("Starting video part generation...")

    try {
      await api.generateParts(getSettings())
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
    getSettingsInputs().concat([
      dom.sourceBrowseButton,
      dom.outputBrowseButton,
      dom.srtBrowseButton,
      dom.checkFfmpegButton,
      dom.chooseFfmpegButton,
      dom.chooseFfprobeButton,
      dom.generateButton,
      dom.openOutputButton
    ]).forEach((element) => {
      element.disabled = isGenerating
    })

    if (!isGenerating) {
      updateConditionalFields()
    }

    dom.statusPill.textContent = isGenerating ? "Working" : "Ready"
  }

  function setStatus(message) {
    dom.statusText.textContent = message
  }

  function setProgress(percent, progress) {
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0))
    dom.progressBar.style.width = `${safePercent}%`

    if (progress && progress.totalParts) {
      dom.progressText.textContent = `${safePercent}% · ${progress.currentPart || progress.current} of ${progress.totalParts}`
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

  function formatDuration(duration) {
    const totalSeconds = Math.max(0, Math.round(Number(duration) || 0))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`
  }

  document.addEventListener("DOMContentLoaded", init)
})()
