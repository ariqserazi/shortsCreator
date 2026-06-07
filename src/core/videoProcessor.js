"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { buildOutputFileName, getUniqueOutputPath } = require("./filenameUtils")
const { getFfmpegOverlayFilter, runFfmpeg, runFfmpegWithProgress } = require("./ffmpegTools")
const { selectVideoEncoder } = require("./encoderSelector")
const { generateLocalCaptions } = require("./captionGenerator")
const { cleanupTempAssFile, createTempAssFile, filterCaptionsForSegment, loadSrtFile } = require("./subtitleTools")
const { ensureOutputFolder, validateGenerationSettings } = require("./validation")
const { createSegmentPlan } = require("./segmentPlanner")
const { readVideoInfo } = require("./videoInfo")
const { findFontFileByFamily } = require("./systemFonts")
const { getRenderPreset, isCutOnlyPreset } = require("./renderPresets")

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

function getOutputSize(settings) {
  const [width, height] = String(settings.outputResolution || "720x1280").split("x").map((value) => Number(value))

  return {
    width: Number.isFinite(width) ? width : 720,
    height: Number.isFinite(height) ? height : 1280
  }
}

function getScaleFlags(settings) {
  return settings.renderPreset === "fast" ? "fast_bilinear" : "bicubic"
}

function createScaleFilter(width, height, options = {}) {
  const parts = [`scale=${width}:${height}`]

  if (options.forceOriginalAspectRatio) {
    parts.push(`force_original_aspect_ratio=${options.forceOriginalAspectRatio}`)
  }

  if (options.flags) {
    parts.push(`flags=${options.flags}`)
  }

  return parts.join(":")
}

function buildAudioEncoderArgs(mode) {
  return mode === "copy" ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k"]
}

function getEvenFloor(value) {
  return Math.max(2, Math.floor(value / 2) * 2)
}

function getEvenOffset(value) {
  return Math.max(0, Math.floor(value / 2) * 2)
}

function getCenteredCrop(sourceSize, outputSize) {
  const sourceWidth = Number(sourceSize && sourceSize.width) || 0
  const sourceHeight = Number(sourceSize && sourceSize.height) || 0

  if (!sourceWidth || !sourceHeight) {
    return null
  }

  const sourceAspect = sourceWidth / sourceHeight
  const outputAspect = outputSize.width / outputSize.height
  let cropWidth = sourceWidth
  let cropHeight = sourceHeight

  if (sourceAspect > outputAspect) {
    cropWidth = getEvenFloor(sourceHeight * outputAspect)
  } else if (sourceAspect < outputAspect) {
    cropHeight = getEvenFloor(sourceWidth / outputAspect)
  }

  cropWidth = Math.min(getEvenFloor(sourceWidth), cropWidth)
  cropHeight = Math.min(getEvenFloor(sourceHeight), cropHeight)

  return {
    width: cropWidth,
    height: cropHeight,
    x: getEvenOffset((sourceWidth - cropWidth) / 2),
    y: getEvenOffset((sourceHeight - cropHeight) / 2)
  }
}

function createCropLayoutFilter(outputSize, sourceSize, scaleFlags = "bicubic") {
  const crop = getCenteredCrop(sourceSize, outputSize)

  if (!crop) {
    return `[0:v]${createScaleFilter(outputSize.width, outputSize.height, {
      forceOriginalAspectRatio: "increase",
      flags: scaleFlags
    })},crop=${outputSize.width}:${outputSize.height},setsar=1[laid]`
  }

  return `[0:v]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},${createScaleFilter(outputSize.width, outputSize.height, {
    flags: scaleFlags
  })},setsar=1[laid]`
}

function createBaseLayoutFilter(layoutMode, segmentDuration, outputSize, sourceSize, scaleFlags = "bicubic") {
  const width = outputSize.width
  const height = outputSize.height

  if (layoutMode === "crop") {
    return createCropLayoutFilter(outputSize, sourceSize, scaleFlags)
  }

  if (layoutMode === "black") {
    return `color=c=black:s=${width}x${height}:d=${segmentDuration}[bg];[0:v]${createScaleFilter(width, height, {
      forceOriginalAspectRatio: "decrease",
      flags: scaleFlags
    })},setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[laid]`
  }

  return `[1:v]setsar=1[bg];[0:v]${createScaleFilter(width, height, {
    forceOriginalAspectRatio: "decrease",
    flags: scaleFlags
  })},setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[laid]`
}

function createLayoutFilter(options) {
  const filters = [
    createBaseLayoutFilter(options.layoutMode, options.segmentDuration, options.outputSize, options.sourceSize, options.scaleFlags)
  ]

  const captionOverlay = options.assPath
    ? `${options.overlayFilterName}=filename='${escapeFilterPath(options.assPath)}'`
    : ""

  if (captionOverlay) {
    filters.push(`[laid]${captionOverlay}[v]`)
  } else {
    filters.push("[laid]null[v]")
  }

  return filters.join(";")
}

async function createStaticBlurBackground({ ffmpegPath, sourceVideo, segment, outputSize }) {
  const tempDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "shortscreator-bg-"))
  const imagePath = path.join(tempDir, "background.png")
  const smallWidth = Math.round(outputSize.width / 8)
  const smallHeight = Math.round(outputSize.height / 8)

  await runFfmpeg(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(segment.start),
    "-i",
    sourceVideo,
    "-frames:v",
    "1",
    "-vf",
    `${createScaleFilter(smallWidth, smallHeight, {
      forceOriginalAspectRatio: "increase",
      flags: "fast_bilinear"
    })},crop=${smallWidth}:${smallHeight},boxblur=3:1,${createScaleFilter(outputSize.width, outputSize.height, {
      flags: "fast_bilinear"
    })}`,
    imagePath
  ])

  return {
    imagePath,
    tempDir
  }
}

function cleanupTempDirectory(tempDir) {
  if (!tempDir) {
    return
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
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

function createProgressHandler({ report, segment, plan, getCompletedParts }) {
  return (progress) => {
    const currentPartPercent = segment.duration > 0
      ? Math.max(0, Math.min(100, Math.round(((progress.outTime || 0) / segment.duration) * 100)))
      : 0
    const completedParts = getCompletedParts()
    const overallPercent = Math.max(0, Math.min(100, Math.round(((completedParts + currentPartPercent / 100) / plan.totalParts) * 100)))

    report.progress({
      currentPart: segment.index,
      totalParts: plan.totalParts,
      current: completedParts,
      total: plan.totalParts,
      currentPartPercent,
      percent: overallPercent,
      fps: progress.fps || "",
      speed: progress.speed || "",
      message: `Rendering Part ${segment.index} of ${plan.totalParts}: ${currentPartPercent}%`
    })
  }
}

async function runFfmpegWithAudioFallback({ ffmpegPath, args, outputPath, audioMode, report, onProgress }) {
  try {
    await runFfmpegWithProgress(ffmpegPath, args, { onProgress })
    return audioMode
  } catch (error) {
    if (audioMode !== "copy") {
      throw error
    }

    report.log("Audio copy failed, retrying with AAC audio encoding.")
    fs.rmSync(outputPath, { force: true })
    const retryArgs = args.slice()
    const audioCopyIndex = retryArgs.findIndex((value, index) => value === "-c:a" && retryArgs[index + 1] === "copy")

    if (audioCopyIndex !== -1) {
      retryArgs.splice(audioCopyIndex, 2, "-c:a", "aac", "-b:a", "160k")
    }

    await runFfmpegWithProgress(ffmpegPath, retryArgs, { onProgress })
    return "aac"
  }
}

async function generateCutOnlyPart({ ffmpegPath, settings, sourceVideo, segment, plan, report, getCompletedParts }) {
  const fileName = buildOutputFileName(settings.videoTitle, segment.index, plan.totalParts)
  const outputPath = getUniqueOutputPath(settings.outputFolder, fileName)
  const startedAt = Date.now()

  report.log(`Writing ${path.basename(outputPath)} from ${formatSeconds(segment.start)} to ${formatSeconds(segment.end)} using stream copy.`)

  await runFfmpegWithProgress(ffmpegPath, [
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
    "-map",
    "0",
    "-c",
    "copy",
    "-avoid_negative_ts",
    "make_zero",
    "-movflags",
    "+faststart",
    outputPath
  ], {
    onProgress: createProgressHandler({ report, segment, plan, getCompletedParts })
  })

  if (!fs.existsSync(outputPath)) {
    throw new Error(`FFmpeg finished but the output file was not created: ${outputPath}`)
  }

  report.log(`Finished ${path.basename(outputPath)} in ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} second(s).`)

  return outputPath
}

async function generateStyledPart({ ffmpegPath, overlayFilterName, titleFontFile, encoderPlan, settings, sourceVideo, sourceSize, segment, plan, captions, report, getCompletedParts }) {
  const fileName = buildOutputFileName(settings.videoTitle, segment.index, plan.totalParts)
  const outputPath = getUniqueOutputPath(settings.outputFolder, fileName)
  const titleText = `${settings.videoTitle} - Part ${segment.index}`
  const segmentCaptions = filterCaptionsForSegment(captions, segment)
  const outputSize = getOutputSize(settings)
  const hasTitle = Boolean(settings.showTitleLabel)
  const hasAssOverlay = hasTitle || segmentCaptions.length > 0
  const tempBackground = settings.layoutMode === "blurred"
    ? await createStaticBlurBackground({
      ffmpegPath,
      sourceVideo,
      segment,
      outputSize
    })
    : { imagePath: "", tempDir: "" }
  const tempAss = hasAssOverlay
    ? createTempAssFile({
      titleText: hasTitle ? titleText : "",
      segment,
      settings,
      captions: segmentCaptions,
      outputSize
    })
    : { assPath: "", tempDir: "" }

  try {
    const filter = createLayoutFilter({
      layoutMode: settings.layoutMode,
      segmentDuration: segment.duration,
      outputSize,
      sourceSize,
      scaleFlags: getScaleFlags(settings),
      titleText,
      titleFontFile,
      settings,
      assPath: tempAss.assPath,
      overlayFilterName
    })

    report.log(`Writing ${path.basename(outputPath)} from ${formatSeconds(segment.start)} to ${formatSeconds(segment.end)}.`)

    const startedAt = Date.now()
    const inputArgs = [
      "-ss",
      String(segment.start),
      "-i",
      sourceVideo,
      ...(tempBackground.imagePath ? [
        "-loop",
        "1",
        "-framerate",
        "1",
        "-i",
        tempBackground.imagePath
      ] : [])
    ]
    const baseArgs = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...inputArgs,
      "-t",
      String(segment.duration),
      "-filter_complex",
      filter,
      "-filter_complex_threads",
      "0",
      "-map",
      "[v]",
      "-map",
      "0:a?",
      ...encoderPlan.encoderArgs,
      "-pix_fmt",
      "yuv420p",
      ...buildAudioEncoderArgs("copy"),
      "-movflags",
      "+faststart",
      outputPath
    ]

    await runFfmpegWithAudioFallback({
      ffmpegPath,
      args: baseArgs,
      outputPath,
      audioMode: "copy",
      report,
      onProgress: createProgressHandler({ report, segment, plan, getCompletedParts })
    })

    if (!fs.existsSync(outputPath)) {
      throw new Error(`FFmpeg finished but the output file was not created: ${outputPath}`)
    }

    report.log(`Finished ${path.basename(outputPath)} in ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} second(s).`)

    return outputPath
  } finally {
    cleanupTempDirectory(tempBackground.tempDir)
    cleanupTempAssFile(tempAss.tempDir)
  }
}

async function generateSegmentsWithLimit({ limit, segments, generateSegment }) {
  const queue = segments.slice()
  const workerCount = Math.max(1, Math.min(limit, queue.length))
  let firstError = null

  async function worker() {
    while (!firstError) {
      const segment = queue.shift()

      if (!segment) {
        return
      }

      try {
        await generateSegment(segment)
      } catch (error) {
        firstError = error
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  if (firstError) {
    throw firstError
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
  const renderPreset = getRenderPreset(settings.renderPreset)
  const cutOnly = isCutOnlyPreset(settings.renderPreset)
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
  const benchmarkSeconds = Number(options.benchmarkSeconds) || 0
  const planningVideoInfo = benchmarkSeconds > 0
    ? Object.assign({}, videoInfo, { duration: Math.min(videoInfo.duration, benchmarkSeconds) })
    : videoInfo
  const plan = createSegmentPlan(planningVideoInfo, settings)
  report.log(`Planned ${plan.totalParts} part(s). Segment length: ${Math.round(plan.segmentLength * 100) / 100}s. Overlap: ${plan.overlapSeconds}s.`)
  report.log("Render settings:")
  report.log(`Preset: ${renderPreset.label}`)
  report.log(`Source duration: ${formatSeconds(videoInfo.duration)}. Source size: ${videoInfo.width}x${videoInfo.height}.`)
  report.log(cutOnly
    ? "Output: source resolution/aspect ratio with no styling."
    : `Output resolution: ${settings.outputResolution}. Layout: ${settings.layoutMode}.`)
  report.log(`Title overlay: ${!cutOnly && settings.showTitleLabel ? "on" : "off"}. Captions: ${cutOnly ? "off" : settings.captionSource}.`)
  report.log(`Parallel jobs: ${settings.parallelJobs}. Expected parts: ${plan.totalParts}.`)

  report.status("Preparing title and captions...")
  const captions = cutOnly ? [] : await prepareCaptions(settings, settings.sourceVideo, report)
  const needsAssOverlay = !cutOnly && (settings.showTitleLabel || captions.length > 0)
  const overlayFilterName = needsAssOverlay ? await getFfmpegOverlayFilter(ffmpegPath) : ""
  const titleFontFile = !cutOnly && settings.showTitleLabel ? await findFontFileByFamily(settings.titleFontFamily) : ""
  const outputSize = cutOnly ? { width: videoInfo.width, height: videoInfo.height } : getOutputSize(settings)
  const encoderPlan = cutOnly
    ? {
      encoderName: "stream copy",
      encoderArgs: ["-c", "copy"],
      label: "stream copy",
      usesHardware: false,
      bitrate: null,
      crf: null,
      strategy: "copy"
    }
    : await selectVideoEncoder({
      ffmpegPath,
      encoderMode: settings.encoderMode,
      renderPreset: settings.renderPreset,
      platform: process.platform,
      width: outputSize.width,
      height: outputSize.height
    })

  if (needsAssOverlay && !overlayFilterName) {
    throw new Error("This FFmpeg build cannot burn ASS title/caption overlays. Choose an FFmpeg build with subtitles or ass filter support, or disable title/captions.")
  }

  if (cutOnly) {
    report.log("Cut Only is fastest, but it does not create vertical 9:16 videos or burned captions.")
  } else if (settings.layoutMode === "blurred") {
    report.log("Blurred background is enabled. This layout is slower because it adds extra scaling and blur work.")
  }

  if (needsAssOverlay) {
    report.log(`Using FFmpeg ${overlayFilterName} filter for ASS title/caption overlays${titleFontFile ? ` with font file: ${titleFontFile}.` : "."}`)
  } else if (!cutOnly) {
    report.log("No title or captions enabled. Skipping ASS overlay filter.")
  }

  report.log(`Encoder selected: ${encoderPlan.label} (${encoderPlan.usesHardware ? "hardware" : encoderPlan.strategy === "copy" ? "stream copy" : "software"}).`)
  report.log(cutOnly ? "Audio mode: stream copy." : "Audio mode: copy first, retry with AAC 160k if needed.")

  if (settings.parallelJobs > 1) {
    report.log(`Rendering up to ${settings.parallelJobs} part(s) at the same time.`)

    if (encoderPlan.usesHardware) {
      report.log("Hardware encoders can be less stable with parallel jobs. Use 1 job if you see encoder failures.")
    }
  }

  if (settings.captionSource === "srt") {
    report.log(`Using FFmpeg ${overlayFilterName} filter for captions.`)
    report.log(`Loaded ${captions.length} subtitle cue(s). Captions are offset per generated part.`)
  }

  let completedParts = 0

  await generateSegmentsWithLimit({
    limit: settings.parallelJobs,
    segments: plan.segments,
    async generateSegment(segment) {
      const message = `Generating Part ${segment.index} of ${plan.totalParts}...`
      report.status(message)
      report.progress({
        currentPart: segment.index,
        totalParts: plan.totalParts,
        current: completedParts,
        total: plan.totalParts,
        percent: Math.round((completedParts / plan.totalParts) * 100),
        message
      })

      const outputPath = await generatePart({
        ffmpegPath,
        overlayFilterName,
        titleFontFile,
        encoderPlan,
        settings,
        sourceVideo: settings.sourceVideo,
        sourceSize: videoInfo,
        segment,
        plan,
        captions,
        report,
        getCompletedParts: () => completedParts
      })

      generatedFiles.push(outputPath)
      completedParts += 1
      report.generated(outputPath)
      report.progress({
        currentPart: segment.index,
        totalParts: plan.totalParts,
        current: completedParts,
        total: plan.totalParts,
        percent: Math.round((completedParts / plan.totalParts) * 100),
        message: `Finished Part ${segment.index} of ${plan.totalParts}.`
      })
    }
  })

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

async function generatePart(options) {
  if (isCutOnlyPreset(options.settings.renderPreset)) {
    return generateCutOnlyPart(options)
  }

  return generateStyledPart(options)
}

async function benchmarkVideoParts(options = {}) {
  const startedAt = Date.now()
  const report = createReporter(options.reporter)
  const result = await generateVideoParts(Object.assign({}, options, {
    benchmarkSeconds: 10,
    settings: Object.assign({}, options.settings || {}, {
      splitMode: "parts",
      partCount: 1,
      overlapSeconds: 0,
    })
  }))
  const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000)
  const speedMultiplier = 10 / elapsedSeconds

  report.log(`10-second test completed in ${Math.round(elapsedSeconds * 10) / 10} seconds. Estimated speed: ${Math.round(speedMultiplier * 10) / 10}x realtime.`)

  return Object.assign({}, result, {
    benchmark: {
      elapsedSeconds,
      speedMultiplier
    }
  })
}

module.exports = {
  createBaseLayoutFilter,
  createCropLayoutFilter,
  createLayoutFilter,
  createStaticBlurBackground,
  getOutputSize,
  benchmarkVideoParts,
  generatePart,
  generateVideoParts
}
