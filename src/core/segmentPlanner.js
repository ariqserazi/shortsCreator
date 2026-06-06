"use strict"

const { validatePlanSettings } = require("./validation")

function roundTime(value) {
  return Math.max(0, Math.round(Number(value) * 1000) / 1000)
}

function createSegmentPlan(videoInfo, rawSettings) {
  const settings = validatePlanSettings(rawSettings)
  const duration = Number(videoInfo.duration)

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Video duration must be known before planning segments.")
  }

  const overlap = settings.overlapSeconds
  let segmentLength = settings.segmentLength
  let partCount = settings.partCount

  if (settings.splitMode === "parts") {
    segmentLength = (duration + overlap * (partCount - 1)) / partCount

    if (segmentLength <= overlap) {
      throw new Error("The requested number of parts is too high for this video and overlap setting.")
    }
  } else {
    partCount = Math.ceil(Math.max(duration - overlap, 0.001) / (segmentLength - overlap))
  }

  const step = segmentLength - overlap
  const segments = []

  for (let index = 0; index < partCount; index += 1) {
    const start = roundTime(index * step)
    const end = roundTime(Math.min(start + segmentLength, duration))

    if (start >= duration || end <= start) {
      break
    }

    segments.push({
      index: index + 1,
      start,
      end,
      duration: roundTime(end - start)
    })
  }

  if (!segments.length) {
    throw new Error("No video parts could be planned from the current settings.")
  }

  return {
    duration,
    segmentLength: roundTime(segmentLength),
    overlapSeconds: overlap,
    splitMode: settings.splitMode,
    totalParts: segments.length,
    segments
  }
}

module.exports = {
  createSegmentPlan
}
