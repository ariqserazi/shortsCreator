"use strict"

const fs = require("node:fs")
const path = require("node:path")

const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9"
])

function sanitizeBaseName(value, fallback = "shortscreator-video") {
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/['`’]/g, "")
    .replace(/[^a-z0-9._ -]+/g, " ")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")

  const safeName = normalized || fallback

  if (RESERVED_WINDOWS_NAMES.has(safeName)) {
    return `${safeName}-video`
  }

  return safeName.slice(0, 120) || fallback
}

function formatPartNumber(index, totalParts) {
  const width = Math.max(2, String(totalParts || index).length)
  return String(index).padStart(width, "0")
}

function buildOutputFileName(title, partIndex, totalParts) {
  const baseName = sanitizeBaseName(title)
  return `${baseName}-part-${formatPartNumber(partIndex, totalParts)}.mp4`
}

function getUniqueOutputPath(outputFolder, fileName) {
  const parsed = path.parse(fileName)
  let candidate = path.join(outputFolder, fileName)
  let counter = 2

  while (fs.existsSync(candidate)) {
    candidate = path.join(outputFolder, `${parsed.name}-${counter}${parsed.ext}`)
    counter += 1
  }

  return candidate
}

function scanGeneratedParts(outputFolder) {
  const resolvedOutputFolder = path.resolve(outputFolder)

  if (!fs.existsSync(resolvedOutputFolder) || !fs.statSync(resolvedOutputFolder).isDirectory()) {
    return []
  }

  return fs.readdirSync(resolvedOutputFolder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mp4$/i.test(entry.name) && /-part-\d+/i.test(entry.name))
    .map((entry) => path.join(resolvedOutputFolder, entry.name))
    .sort()
}

module.exports = {
  buildOutputFileName,
  formatPartNumber,
  getUniqueOutputPath,
  sanitizeBaseName,
  scanGeneratedParts
}
