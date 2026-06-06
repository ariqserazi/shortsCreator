"use strict"

const fs = require("node:fs")
const path = require("node:path")

const SUPPORTED_EXTENSIONS = Object.freeze([
  ".mp4",
  ".mkv",
  ".mov",
  ".avi",
  ".m4v"
])

const GENERATED_CLIP_PATTERN = /^broll_\d{4}\.mp4$/i

function isSupportedVideoFile(fileName) {
  return SUPPORTED_EXTENSIONS.includes(path.extname(fileName).toLowerCase())
}

function scanVideoFiles(inputFolder, outputFolder) {
  const resolvedInputFolder = path.resolve(inputFolder)
  const resolvedOutputFolder = outputFolder ? path.resolve(outputFolder) : ""
  const outputInsideInput = resolvedOutputFolder && resolvedInputFolder === resolvedOutputFolder

  return fs.readdirSync(resolvedInputFolder, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isFile()) {
        return false
      }

      if (outputInsideInput && GENERATED_CLIP_PATTERN.test(entry.name)) {
        return false
      }

      return isSupportedVideoFile(entry.name)
    })
    .map((entry) => path.join(resolvedInputFolder, entry.name))
    .sort()
}

function scanGeneratedClips(outputFolder) {
  const resolvedOutputFolder = path.resolve(outputFolder)

  if (!fs.existsSync(resolvedOutputFolder) || !fs.statSync(resolvedOutputFolder).isDirectory()) {
    return []
  }

  return fs.readdirSync(resolvedOutputFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && GENERATED_CLIP_PATTERN.test(entry.name))
    .map((entry) => path.join(resolvedOutputFolder, entry.name))
    .sort()
}

module.exports = {
  GENERATED_CLIP_PATTERN,
  SUPPORTED_EXTENSIONS,
  isSupportedVideoFile,
  scanGeneratedClips,
  scanVideoFiles
}
