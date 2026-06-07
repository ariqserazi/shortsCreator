"use strict"

const { getFfmpegEncoders } = require("./ffmpegTools")

const HARDWARE_ENCODERS = Object.freeze([
  "h264_videotoolbox",
  "h264_nvenc",
  "h264_qsv",
  "h264_amf"
])

const BITRATE_PROFILES = Object.freeze({
  fast: Object.freeze({
    "720x1280": { bitrate: "3500k", maxrate: "4500k", bufsize: "7000k" },
    "1080x1920": { bitrate: "6000k", maxrate: "8000k", bufsize: "12000k" }
  }),
  balanced: Object.freeze({
    "720x1280": { bitrate: "3500k", maxrate: "4500k", bufsize: "7000k" },
    "1080x1920": { bitrate: "6000k", maxrate: "8000k", bufsize: "12000k" }
  }),
  highQuality: Object.freeze({
    "720x1280": { bitrate: "5000k", maxrate: "6500k", bufsize: "10000k" },
    "1080x1920": { bitrate: "8000k", maxrate: "10000k", bufsize: "16000k" }
  })
})

const SOFTWARE_PROFILES = Object.freeze({
  fast: Object.freeze({ preset: "ultrafast", crf: 24 }),
  balanced: Object.freeze({ preset: "veryfast", crf: 22 }),
  highQuality: Object.freeze({ preset: "medium", crf: 20 })
})

function hasEncoder(encoders, encoderName) {
  return new RegExp(`(^|\\n)\\s*\\S+\\s+${encoderName}\\s+`, "m").test(encoders)
}

async function getAvailableEncoders(ffmpegPath) {
  const encoders = await getFfmpegEncoders(ffmpegPath)

  return {
    h264_videotoolbox: hasEncoder(encoders, "h264_videotoolbox"),
    h264_nvenc: hasEncoder(encoders, "h264_nvenc"),
    h264_qsv: hasEncoder(encoders, "h264_qsv"),
    h264_amf: hasEncoder(encoders, "h264_amf"),
    libx264: hasEncoder(encoders, "libx264")
  }
}

function getHardwarePreference(platform) {
  if (platform === "darwin") {
    return ["h264_videotoolbox"]
  }

  if (platform === "win32") {
    return ["h264_nvenc", "h264_qsv", "h264_amf"]
  }

  return HARDWARE_ENCODERS
}

function getResolutionKey(width, height) {
  return `${width}x${height}`
}

function getBitrateProfile(renderPreset, width, height) {
  const presetProfiles = BITRATE_PROFILES[renderPreset] || BITRATE_PROFILES.fast
  return presetProfiles[getResolutionKey(width, height)] || presetProfiles["720x1280"]
}

function getSoftwareProfile(renderPreset) {
  return SOFTWARE_PROFILES[renderPreset] || SOFTWARE_PROFILES.fast
}

function buildHardwareArgs(encoderName, profile, renderPreset) {
  const args = [
    "-c:v",
    encoderName,
    "-b:v",
    profile.bitrate,
    "-maxrate",
    profile.maxrate,
    "-bufsize",
    profile.bufsize
  ]

  if (encoderName === "h264_videotoolbox") {
    args.push("-profile:v", "high", "-realtime", renderPreset === "fast" ? "true" : "false", "-allow_sw", "true")
  } else if (encoderName === "h264_nvenc") {
    args.push("-preset", renderPreset === "fast" ? "p1" : "p4")
  } else if (encoderName === "h264_qsv") {
    args.push("-preset", renderPreset === "fast" ? "veryfast" : "faster")
  }

  return args
}

function buildSoftwareArgs(profile) {
  return [
    "-c:v",
    "libx264",
    "-preset",
    profile.preset,
    "-crf",
    String(profile.crf),
    "-threads",
    "0"
  ]
}

async function selectVideoEncoder({ ffmpegPath, encoderMode, renderPreset, platform, width, height }) {
  const normalizedMode = encoderMode === "hardware" || encoderMode === "software" ? encoderMode : "auto"
  const preset = renderPreset === "highQuality" ? "highQuality" : renderPreset === "balanced" ? "balanced" : "fast"
  const availableEncoders = await getAvailableEncoders(ffmpegPath)
  const hardwareEncoder = getHardwarePreference(platform || process.platform).find((encoderName) => availableEncoders[encoderName]) || ""

  if (normalizedMode !== "software" && hardwareEncoder) {
    const bitrateProfile = getBitrateProfile(preset, width, height)

    return {
      encoderName: hardwareEncoder,
      encoderArgs: buildHardwareArgs(hardwareEncoder, bitrateProfile, preset),
      label: `${hardwareEncoder} ${bitrateProfile.bitrate}`,
      usesHardware: true,
      bitrate: bitrateProfile.bitrate,
      crf: null,
      strategy: "bitrate"
    }
  }

  if (normalizedMode === "hardware") {
    throw new Error("Hardware H.264 encoding was selected, but this FFmpeg build does not expose a supported hardware encoder.")
  }

  if (!availableEncoders.libx264) {
    throw new Error("This FFmpeg build does not expose libx264, so shortsCreator cannot encode H.264 output.")
  }

  const softwareProfile = getSoftwareProfile(preset)

  return {
    encoderName: "libx264",
    encoderArgs: buildSoftwareArgs(softwareProfile),
    label: `libx264 ${softwareProfile.preset} CRF ${softwareProfile.crf}`,
    usesHardware: false,
    bitrate: null,
    crf: softwareProfile.crf,
    strategy: "crf"
  }
}

module.exports = {
  buildHardwareArgs,
  buildSoftwareArgs,
  getAvailableEncoders,
  selectVideoEncoder
}
