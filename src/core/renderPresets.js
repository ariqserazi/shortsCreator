"use strict"

const RENDER_PRESETS = Object.freeze({
  fast: Object.freeze({
    id: "fast",
    label: "Fast",
    outputResolution: "720x1280",
    layoutMode: "crop",
    encoderMode: "auto",
    encoderPreset: "ultrafast",
    crf: 24,
    showTitleLabel: true,
    allowCaptions: true,
    cutOnly: false
  }),
  balanced: Object.freeze({
    id: "balanced",
    label: "Balanced",
    outputResolution: "1080x1920",
    layoutMode: "crop",
    encoderMode: "auto",
    encoderPreset: "veryfast",
    crf: 22,
    showTitleLabel: true,
    allowCaptions: true,
    cutOnly: false
  }),
  highQuality: Object.freeze({
    id: "highQuality",
    label: "High Quality",
    outputResolution: "1080x1920",
    layoutMode: "crop",
    encoderMode: "software",
    encoderPreset: "medium",
    crf: 20,
    showTitleLabel: true,
    allowCaptions: true,
    cutOnly: false
  }),
  cutOnly: Object.freeze({
    id: "cutOnly",
    label: "Cut Only / No Styling",
    outputResolution: "source",
    layoutMode: "source",
    encoderMode: "copy",
    encoderPreset: "copy",
    crf: 0,
    showTitleLabel: false,
    allowCaptions: false,
    cutOnly: true
  })
})

function getRenderPreset(renderPreset) {
  return RENDER_PRESETS[renderPreset] || RENDER_PRESETS.fast
}

function isCutOnlyPreset(renderPreset) {
  return getRenderPreset(renderPreset).cutOnly
}

function getRenderPresetIds() {
  return Object.keys(RENDER_PRESETS)
}

module.exports = {
  RENDER_PRESETS,
  getRenderPreset,
  getRenderPresetIds,
  isCutOnlyPreset
}
