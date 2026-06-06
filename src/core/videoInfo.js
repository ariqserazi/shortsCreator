"use strict"

const { runFfprobeJson } = require("./ffmpegTools")

async function readVideoInfo(ffprobePath, filePath) {
  const metadata = await runFfprobeJson(ffprobePath, [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    filePath
  ])

  const streams = Array.isArray(metadata.streams) ? metadata.streams : []
  const format = metadata.format || {}
  const videoStream = streams.find((stream) => stream.codec_type === "video") || null
  const audioStream = streams.find((stream) => stream.codec_type === "audio") || null
  const duration = Number(format.duration || (videoStream && videoStream.duration))

  if (!videoStream) {
    throw new Error("The selected file does not contain a video stream.")
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not read a valid duration from the selected video.")
  }

  return {
    filePath,
    duration,
    width: Number(videoStream.width) || 0,
    height: Number(videoStream.height) || 0,
    videoCodec: videoStream.codec_name || "",
    audioCodec: audioStream ? audioStream.codec_name || "" : "",
    hasAudio: Boolean(audioStream)
  }
}

module.exports = {
  readVideoInfo
}
