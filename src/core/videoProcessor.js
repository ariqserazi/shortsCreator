"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { buildOutputFileName, getUniqueOutputPath } = require("./filenameUtils")
const { getFfmpegOverlayFilter, runFfmpeg } = require("./ffmpegTools")
const { generateLocalCaptions } = require("./captionGenerator")
const { cleanupTempAssFile, createTempAssFile, filterCaptionsForSegment, loadSrtFile } = require("./subtitleTools")
const { ensureOutputFolder, validateGenerationSettings } = require("./validation")
const { createSegmentPlan } = require("./segmentPlanner")
const { readVideoInfo } = require("./videoInfo")

function noop() {}

function createReporter(reporter = {}) {
  return {
    generated: typeof reporter.generated === "function" ? reporter.generated : noop,
    log: typeof reporter.log === "function" ? reporter.log : noop,
    progress: typeof reporter.progress === "function" ? reporter.progress : noop,
    status: typeof reporter.status === "function" ? reporter.status : noop
  }
}

function escapeFilterPath(filePath) {
  return String(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
}

function createLayoutFilter(layoutMode, segmentDuration, assPath, overlayFilterName = "subtitles") {
  const overlayFilter = `${overlayFilterName}=filename='${escapeFilterPath(assPath)}'`

  if (layoutMode === "crop") {
    return `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[laid];[laid]${overlayFilter}[v]`
  }

  if (layoutMode === "black") {
    return `color=c=black:s=1080x1920:d=${segmentDuration}[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[laid];[laid]${overlayFilter}[v]`
  }

  return `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=34,setsar=1[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[laid];[laid]${overlayFilter}[v]`
}

async function prepareCaptions(settings, sourceVideo, report) {
  if (settings.captionSource === "none") {
    return []
  }

  if (settings.captionSource === "srt") {
    report.log(`Loading subtitles: ${settings.srtFile}`)
    return loadSrtFile(settings.srtFile)
  }

  if (settings.captionSource === "auto") {
    return generateLocalCaptions({ settings, sourceVideo, report })
  }

  return []
}

async function generatePart({ ffmpegPath, overlayFilterName, settings, sourceVideo, segment, plan, captions, report }) {
  const fileName = buildOutputFileName(settings.videoTitle, segment.index, plan.totalParts)
  const outputPath = getUniqueOutputPath(settings.outputFolder, fileName)
  const titleText = `${settings.videoTitle} - Part ${segment.index}`
  const segmentCaptions = filterCaptionsForSegment(captions, segment)
  const tempAss = createTempAssFile({
    titleText,
    segment,
    settings,
    captions: segmentCaptions
  })

  try {
    const filter = createLayoutFilter(settings.layoutMode, segment.duration, tempAss.assPath, overlayFilterName)

    report.log(`Writing ${path.basename(outputPath)} from ${formatSeconds(segment.start)} to ${formatSeconds(segment.end)}.`)

    await runFfmpeg(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(segment.start),
      "-i",
      sourceVideo,
      "-t",
      String(segment.duration),
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      String(settings.crf),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      "-shortest",
      outputPath
    ])

    if (!fs.existsSync(outputPath)) {
      throw new Error(`FFmpeg finished but the output file was not created: ${outputPath}`)
    }

    return outputPath
  } finally {
    cleanupTempAssFile(tempAss.tempDir)
  }
}

function formatSeconds(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

async function generateVideoParts(options = {}) {
  const report = createReporter(options.reporter)
  const ffmpegPath = options.ffmpegPath
  const ffprobePath = options.ffprobePath

  if (!ffmpegPath || !ffprobePath) {
    throw new Error("ffmpeg and ffprobe are required before video parts can be generated.")
  }

  const settings = validateGenerationSettings(options.settings)
  const outputResult = ensureOutputFolder(settings.outputFolder)
  const generatedFiles = []

  if (outputResult.created) {
    report.log(`Created output folder: ${outputResult.path}`)
  }

  report.status("Reading video info...")
  report.log(`Source video: ${settings.sourceVideo}`)
  const videoInfo = await readVideoInfo(ffprobePath, settings.sourceVideo)

  report.log(`Video duration: ${formatSeconds(videoInfo.duration)}. Source size: ${videoInfo.width}x${videoInfo.height}.`)
  report.status("Planning segments...")
  const plan = createSegmentPlan(videoInfo, settings)
  report.log(`Planned ${plan.totalParts} part(s). Segment length: ${Math.round(plan.segmentLength * 100) / 100}s. Overlap: ${plan.overlapSeconds}s.`)

  report.status("Preparing captions...")
  const captions = await prepareCaptions(settings, settings.sourceVideo, report)
  const overlayFilterName = await getFfmpegOverlayFilter(ffmpegPath)

  if (!overlayFilterName) {
    throw new Error("This FFmpeg build does not include the subtitles or ass video filter required for title labels and burned captions. Install a full FFmpeg build with libass support, then choose that ffmpeg path in shortsCreator.")
  }

  report.log(`Using FFmpeg ${overlayFilterName} filter for title and caption overlays.`)

  if (settings.captionSource === "srt") {
    report.log(`Loaded ${captions.length} subtitle cue(s). Captions are offset per generated part.`)
  }

  for (let index = 0; index < plan.segments.length; index += 1) {
    const segment = plan.segments[index]
    const message = `Generating Part ${segment.index} of ${plan.totalParts}...`
    report.status(message)
    report.progress({
      currentPart: segment.index,
      totalParts: plan.totalParts,
      current: index,
      total: plan.totalParts,
      percent: Math.round((index / plan.totalParts) * 100),
      message
    })

    const outputPath = await generatePart({
      ffmpegPath,
      overlayFilterName,
      settings,
      sourceVideo: settings.sourceVideo,
      segment,
      plan,
      captions,
      report
    })

    generatedFiles.push(outputPath)
    report.generated(outputPath)
    report.progress({
      currentPart: segment.index,
      totalParts: plan.totalParts,
      current: index + 1,
      total: plan.totalParts,
      percent: Math.round(((index + 1) / plan.totalParts) * 100),
      message: `Finished Part ${segment.index} of ${plan.totalParts}.`
    })
  }

  report.status("Finished")
  report.log(`Finished. Created ${generatedFiles.length} video part(s) in: ${settings.outputFolder}`)

  return {
    generatedFiles,
    outputFolder: settings.outputFolder,
    sourceVideo: settings.sourceVideo,
    videoInfo,
    plan
  }
}

module.exports = {
  createLayoutFilter,
  generatePart,
  generateVideoParts
}
