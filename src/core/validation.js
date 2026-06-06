"use strict"

const fs = require("node:fs")
const path = require("node:path")

const DEFAULT_SETTINGS = Object.freeze({
  inputFolder: "",
  outputFolder: "",
  clipCount: 30,
  clipLength: 6,
  skipFirstSeconds: 90,
  skipLastSeconds: 90,
  randomizeStartTimes: false,
  ffmpegPath: "",
  ffprobePath: ""
})

function toNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return NaN
  }

  return Number(value)
}

function normalizeSettings(rawSettings) {
  const settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings || {})

  return {
    inputFolder: String(settings.inputFolder || "").trim(),
    outputFolder: String(settings.outputFolder || "").trim(),
    clipCount: toNumber(settings.clipCount),
    clipLength: toNumber(settings.clipLength),
    skipFirstSeconds: toNumber(settings.skipFirstSeconds),
    skipLastSeconds: toNumber(settings.skipLastSeconds),
    randomizeStartTimes: Boolean(settings.randomizeStartTimes),
    ffmpegPath: String(settings.ffmpegPath || "").trim(),
    ffprobePath: String(settings.ffprobePath || "").trim()
  }
}

function validateGenerationSettings(rawSettings) {
  const settings = normalizeSettings(rawSettings)

  if (!settings.inputFolder) {
    throw new Error("Input folder is required.")
  }

  if (!settings.outputFolder) {
    throw new Error("Output folder is required.")
  }

  if (!Number.isInteger(settings.clipCount) || settings.clipCount <= 0) {
    throw new Error("Clip count must be a positive whole number.")
  }

  if (!Number.isFinite(settings.clipLength) || settings.clipLength <= 0) {
    throw new Error("Clip length must be greater than 0.")
  }

  if (!Number.isFinite(settings.skipFirstSeconds) || settings.skipFirstSeconds < 0) {
    throw new Error("Skip first seconds must be 0 or greater.")
  }

  if (!Number.isFinite(settings.skipLastSeconds) || settings.skipLastSeconds < 0) {
    throw new Error("Skip last seconds must be 0 or greater.")
  }

  const inputFolder = path.resolve(settings.inputFolder)
  const outputFolder = path.resolve(settings.outputFolder)

  if (!fs.existsSync(inputFolder) || !fs.statSync(inputFolder).isDirectory()) {
    throw new Error(`Input folder does not exist: ${inputFolder}`)
  }

  return Object.assign({}, settings, {
    inputFolder,
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
  ensureOutputFolder,
  normalizeSettings,
  validateGenerationSettings
}
