"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

function parseSrtTimestamp(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/)

  if (!match) {
    return null
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const milliseconds = Number(match[4].padEnd(3, "0"))

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

function parseSrt(content) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean)
      const timeLineIndex = lines.findIndex((line) => line.includes("-->"))

      if (timeLineIndex === -1) {
        return null
      }

      const timeMatch = lines[timeLineIndex].match(/(.+?)\s*-->\s*(.+?)(?:\s|$)/)

      if (!timeMatch) {
        return null
      }

      const start = parseSrtTimestamp(timeMatch[1])
      const end = parseSrtTimestamp(timeMatch[2])
      const text = lines.slice(timeLineIndex + 1).join("\n").trim()

      if (start === null || end === null || end <= start || !text) {
        return null
      }

      return { start, end, text }
    })
    .filter(Boolean)
}

function loadSrtFile(filePath) {
  return parseSrt(fs.readFileSync(filePath, "utf8"))
}

function formatAssTime(seconds) {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100))
  const centiseconds = totalCentiseconds % 100
  const totalSeconds = Math.floor(totalCentiseconds / 100)
  const displaySeconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  return `${hours}:${String(minutes).padStart(2, "0")}:${String(displaySeconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`
}

function escapeAssText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/<[^>]+>/g, "")
    .replace(/\n+/g, "\\N")
}

function sanitizeAssField(value, fallback) {
  return String(value || fallback || "")
    .replace(/[\r\n,]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback
}

function formatAssBlackWithOpacity(opacityPercent) {
  const rawOpacity = Number(opacityPercent)
  const opacity = Number.isFinite(rawOpacity) ? Math.max(0, Math.min(100, rawOpacity)) : 100
  const alpha = 255 - Math.round(opacity * 2.55)
  return `&H${alpha.toString(16).toUpperCase().padStart(2, "0")}000000`
}

function scaleNumber(value, scale, fallback) {
  const rawValue = Number(value)
  const source = Number.isFinite(rawValue) ? rawValue : fallback

  return Math.max(1, Math.round(source * scale))
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function getAssScale(outputSize) {
  const width = Number(outputSize && outputSize.width) || 1080
  const height = Number(outputSize && outputSize.height) || 1920

  return {
    width,
    height,
    x: width / 1080,
    y: height / 1920,
    text: Math.min(width / 1080, height / 1920)
  }
}

function getCaptionStyle(settings, outputSize) {
  const scale = getAssScale(outputSize)
  const fontSize = scaleNumber(settings.captionFontSize, scale.text, 58)
  const y = clampNumber(scaleNumber(settings.captionVerticalPosition, scale.y, 1450), 40, scale.height - 40)
  const preset = settings.captionStylePreset

  if (preset === "boxed") {
    return {
      fontSize,
      primary: "&H00FFFFFF",
      outline: "&HAA000000",
      borderStyle: 3,
      outlineSize: 3,
      shadow: 0,
      y
    }
  }

  if (preset === "simple") {
    return {
      fontSize,
      primary: "&H00FFFFFF",
      outline: "&H00000000",
      borderStyle: 1,
      outlineSize: 3,
      shadow: 1,
      y
    }
  }

  return {
    fontSize,
    primary: "&H00FFFFFF",
    outline: "&H00000000",
    borderStyle: 1,
    outlineSize: 5,
    shadow: 2,
    y
  }
}

function buildAssOverlay({ titleText, segment, settings, captions, outputSize }) {
  const scale = getAssScale(outputSize)
  const captionStyle = getCaptionStyle(settings, outputSize)
  const titleFontFamily = sanitizeAssField(settings.titleFontFamily, "Arial")
  const titleBoxColor = formatAssBlackWithOpacity(settings.titleHighlightOpacity)
  const title = escapeAssText(titleText)
  const titleFontSize = scaleNumber(58, scale.text, 58)
  const titleOutline = scaleNumber(4, scale.text, 4)
  const titleMarginX = scaleNumber(70, scale.x, 70)
  const titleMarginY = scaleNumber(86, scale.y, 86)
  const captionMarginX = scaleNumber(70, scale.x, 70)
  const captionMarginY = scaleNumber(70, scale.y, 70)
  const lines = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    `PlayResX: ${scale.width}`,
    `PlayResY: ${scale.height}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Title,${titleFontFamily},${titleFontSize},&H00FFFFFF,&H000000FF,${titleBoxColor},${titleBoxColor},-1,0,0,0,100,100,0,0,3,${titleOutline},0,8,${titleMarginX},${titleMarginX},${titleMarginY},1`,
    `Style: Caption,Arial,${captionStyle.fontSize},${captionStyle.primary},&H000000FF,${captionStyle.outline},&HAA000000,-1,0,0,0,100,100,0,0,${captionStyle.borderStyle},${captionStyle.outlineSize},${captionStyle.shadow},5,${captionMarginX},${captionMarginX},${captionMarginY},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
  ]

  if (titleText) {
    lines.push(`Dialogue: 1,${formatAssTime(0)},${formatAssTime(segment.duration)},Title,,0,0,0,,${title}`)
  }

  for (const caption of captions || []) {
    const start = Math.max(0, caption.start - segment.start)
    const end = Math.min(segment.duration, caption.end - segment.start)

    if (end <= start) {
      continue
    }

    lines.push(`Dialogue: 2,${formatAssTime(start)},${formatAssTime(end)},Caption,,0,0,0,,{\\an5\\pos(${Math.round(scale.width / 2)},${captionStyle.y})}${escapeAssText(caption.text)}`)
  }

  return `${lines.join("\n")}\n`
}

function filterCaptionsForSegment(captions, segment) {
  return (captions || []).filter((caption) => {
    return caption.end > segment.start && caption.start < segment.end
  })
}

function createTempAssFile(options) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortscreator-"))
  const assPath = path.join(tempDir, `part-${String(options.segment.index).padStart(2, "0")}.ass`)
  fs.writeFileSync(assPath, buildAssOverlay(options), "utf8")
  return {
    assPath,
    tempDir
  }
}

function cleanupTempAssFile(tempDir) {
  if (!tempDir) {
    return
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
}

module.exports = {
  buildAssOverlay,
  cleanupTempAssFile,
  createTempAssFile,
  formatAssBlackWithOpacity,
  filterCaptionsForSegment,
  loadSrtFile,
  parseSrt
}
