"use strict"

const fs = require("node:fs")
const path = require("node:path")

const SUPPORTED_INPUT_EXTENSIONS = Object.freeze([
  ".mp4",
  ".mov",
  ".mkv",
  ".avi",
  ".m4v"
])

const DEFAULT_SETTINGS = Object.freeze({
  sourceVideo: "",
  outputFolder: "",
  videoTitle: "",
  splitMode: "length",
  segmentLength: 60,
  partCount: 5,
  overlapSeconds: 5,
  layoutMode: "blurred",
  captionSource: "none",
  srtFile: "",
  captionFontSize: 58,
  captionVerticalPosition: 1450,
  captionStylePreset: "tiktok",
  crf: 22,
  ffmpegPath: "",
  ffprobePath: ""
})

const SPLIT_MODES = new Set(["length", "parts"])
const LAYOUT_MODES = new Set(["blurred", "crop", "black"])
const CAPTION_SOURCES = new Set(["none", "srt", "auto"])
const CAPTION_STYLE_PRESETS = new Set(["tiktok", "simple", "boxed"])

function toNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return NaN
  }

  return Number(value)
}

function isSupportedInputVideo(filePath) {
  return SUPPORTED_INPUT_EXTENSIONS.includes(path.extname(String(filePath || "")).toLowerCase())
}

function normalizeSettings(rawSettings) {
  const settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings || {})
  const splitMode = SPLIT_MODES.has(settings.splitMode) ? settings.splitMode : DEFAULT_SETTINGS.splitMode
  const layoutMode = LAYOUT_MODES.has(settings.layoutMode) ? settings.layoutMode : DEFAULT_SETTINGS.layoutMode
  const captionSource = CAPTION_SOURCES.has(settings.captionSource) ? settings.captionSource : DEFAULT_SETTINGS.captionSource
  const captionStylePreset = CAPTION_STYLE_PRESETS.has(settings.captionStylePreset)
    ? settings.captionStylePreset
    : DEFAULT_SETTINGS.captionStylePreset

  return {
    sourceVideo: String(settings.sourceVideo || "").trim(),
    outputFolder: String(settings.outputFolder || "").trim(),
    videoTitle: String(settings.videoTitle || "").trim(),
    splitMode,
    segmentLength: toNumber(settings.segmentLength),
    partCount: toNumber(settings.partCount),
    overlapSeconds: toNumber(settings.overlapSeconds),
    layoutMode,
    captionSource,
    srtFile: String(settings.srtFile || "").trim(),
    captionFontSize: toNumber(settings.captionFontSize),
    captionVerticalPosition: toNumber(settings.captionVerticalPosition),
    captionStylePreset,
    crf: toNumber(settings.crf),
    ffmpegPath: String(settings.ffmpegPath || "").trim(),
    ffprobePath: String(settings.ffprobePath || "").trim()
  }
}

function validatePlanSettings(rawSettings) {
  const settings = normalizeSettings(rawSettings)

  if (settings.splitMode === "length" && (!Number.isFinite(settings.segmentLength) || settings.segmentLength <= 0)) {
    throw new Error("Segment length must be greater than 0 seconds.")
  }

  if (settings.splitMode === "parts" && (!Number.isInteger(settings.partCount) || settings.partCount <= 0)) {
    throw new Error("Number of parts must be a positive whole number.")
  }

  if (!Number.isFinite(settings.overlapSeconds) || settings.overlapSeconds < 0) {
    throw new Error("Overlap/rewind seconds must be 0 or greater.")
  }

  if (settings.splitMode === "length" && settings.overlapSeconds >= settings.segmentLength) {
    throw new Error("Overlap/rewind seconds must be less than the segment length.")
  }

  return settings
}

function validateGenerationSettings(rawSettings) {
  const settings = validatePlanSettings(rawSettings)

  if (!settings.sourceVideo) {
    throw new Error("Source video is required.")
  }

  if (!settings.outputFolder) {
    throw new Error("Output folder is required.")
  }

  if (!settings.videoTitle) {
    throw new Error("Video title is required.")
  }

  const sourceVideo = path.resolve(settings.sourceVideo)
  const outputFolder = path.resolve(settings.outputFolder)

  if (!fs.existsSync(sourceVideo) || !fs.statSync(sourceVideo).isFile()) {
    throw new Error(`Source video does not exist: ${sourceVideo}`)
  }

  if (!isSupportedInputVideo(sourceVideo)) {
    throw new Error(`Unsupported input video format. Supported formats: ${SUPPORTED_INPUT_EXTENSIONS.join(", ")}`)
  }

  if (settings.captionSource === "srt") {
    if (!settings.srtFile) {
      throw new Error("Choose an SRT file or set captions to No captions.")
    }

    const srtFile = path.resolve(settings.srtFile)

    if (!fs.existsSync(srtFile) || !fs.statSync(srtFile).isFile()) {
      throw new Error(`SRT file does not exist: ${srtFile}`)
    }

    if (path.extname(srtFile).toLowerCase() !== ".srt") {
      throw new Error("Caption file must be an .srt file.")
    }

    settings.srtFile = srtFile
  }

  if (settings.captionSource === "auto") {
    throw new Error("Local automatic caption generation is not implemented yet. Choose No captions or Use SRT file.")
  }

  if (!Number.isFinite(settings.captionFontSize) || settings.captionFontSize < 24 || settings.captionFontSize > 120) {
    throw new Error("Caption font size must be between 24 and 120.")
  }

  if (!Number.isFinite(settings.captionVerticalPosition) || settings.captionVerticalPosition < 300 || settings.captionVerticalPosition > 1800) {
    throw new Error("Caption vertical position must be between 300 and 1800.")
  }

  if (!Number.isFinite(settings.crf) || settings.crf < 18 || settings.crf > 30) {
    throw new Error("CRF must be between 18 and 30.")
  }

  return Object.assign({}, settings, {
    sourceVideo,
    outputFolder
  })
}

function ensureOutputFolder(outputFolder) {
  const resolvedOutputFolder = path.resolve(outputFolder)

  if (!fs.existsSync(resolvedOutputFolder)) {
    fs.mkdirSync(resolvedOutputFolder, { recursive: true })
    return {
      path: resolvedOutputFolder,
      created: true
    }
  }

  if (!fs.statSync(resolvedOutputFolder).isDirectory()) {
    throw new Error(`Output path is not a folder: ${resolvedOutputFolder}`)
  }

  return {
    path: resolvedOutputFolder,
    created: false
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  SUPPORTED_INPUT_EXTENSIONS,
  ensureOutputFolder,
  isSupportedInputVideo,
  normalizeSettings,
  validateGenerationSettings,
  validatePlanSettings
}
