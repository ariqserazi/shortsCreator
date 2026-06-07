"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const PImage = require("pureimage")

function clampOpacity(value) {
  const rawOpacity = Number(value)
  return Number.isFinite(rawOpacity) ? Math.max(0, Math.min(100, rawOpacity)) / 100 : 1
}

function loadFont(fontPath, family) {
  if (!fontPath || !fs.existsSync(fontPath)) {
    return false
  }

  try {
    PImage.registerFont(fontPath, family).loadSync()
    return true
  } catch (error) {
    return false
  }
}

function fitText(ctx, text, maxWidth, startingSize) {
  let fontSize = startingSize

  while (fontSize > 28) {
    ctx.font = `${fontSize}pt "TitleFont"`

    if (ctx.measureText(text).width <= maxWidth) {
      return fontSize
    }

    fontSize -= 2
  }

  ctx.font = `${fontSize}pt "TitleFont"`
  return fontSize
}

async function createTempTitleImage({ titleText, fontPath, highlightOpacity, outputWidth, outputHeight }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortscreator-title-"))
  const imagePath = path.join(tempDir, "title.png")
  const width = outputWidth
  const height = Math.round(outputHeight * 0.115)
  const image = PImage.make(width, height)
  const ctx = image.getContext("2d")
  const loadedFont = loadFont(fontPath, "TitleFont")
  const text = String(titleText || "")
  const startingSize = Math.round(outputWidth * 0.054)
  const maxTextWidth = Math.round(outputWidth * 0.91)
  const fontSize = loadedFont ? fitText(ctx, text, maxTextWidth, startingSize) : startingSize

  if (!loadedFont) {
    ctx.font = `${fontSize}pt sans-serif`
  }

  const metrics = ctx.measureText(text)
  const textWidth = Math.min(metrics.width, maxTextWidth)
  const boxWidth = Math.ceil(textWidth + outputWidth * 0.039)
  const boxHeight = Math.ceil(fontSize + outputWidth * 0.039)
  const boxX = Math.round((width - boxWidth) / 2)
  const boxY = Math.round(outputHeight * 0.025)
  const baselineY = boxY + Math.round(fontSize * 0.78) + Math.round(outputWidth * 0.017)

  ctx.fillStyle = `rgba(0, 0, 0, ${clampOpacity(highlightOpacity)})`
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
  ctx.fillStyle = "white"
  ctx.textAlign = "center"
  ctx.fillText(text, width / 2, baselineY)

  await PImage.encodePNGToStream(image, fs.createWriteStream(imagePath))

  return {
    imagePath,
    tempDir
  }
}

function cleanupTempTitleImage(tempDir) {
  if (!tempDir) {
    return
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
}

module.exports = {
  cleanupTempTitleImage,
  createTempTitleImage
}
