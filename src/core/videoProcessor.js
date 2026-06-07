"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { buildOutputFileName, getUniqueOutputPath } = require("./filenameUtils")
const { getAvailableVideoEncoders, getFfmpegOverlayFilter, runFfmpeg } = require("./ffmpegTools")
const { generateLocalCaptions } = require("./captionGenerator")
const { cleanupTempAssFile, createTempAssFile, filterCaptionsForSegment, loadSrtFile } = require("./subtitleTools")
const { ensureOutputFolder, validateGenerationSettings } = require("./validation")
const { createSegmentPlan } = require("./segmentPlanner")
const { readVideoInfo } = require("./videoInfo")
const { findFontFileByFamily } = require("./systemFonts")
const { cleanupTempTitleImage, createTempTitleImage } = require("./titleImage")

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

function getPreferredHardwareEncoder(availableEncoders) {
  const platformOrder = process.platform === "darwin"
    ? ["h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf"]
    : ["h264_nvenc", "h264_qsv", "h264_amf", "h264_videotoolbox"]

  return platformOrder.find((encoderName) => availableEncoders[encoderName]) || ""
}

function getHardwareBitrateKbps(settings, outputSize) {
  const pixels = outputSize.width * outputSize.height
  const qualityMultiplier = Math.pow(2, (22 - settings.crf) / 6)
  const bitrate = pixels * 0.0042 * qualityMultiplier
  const clamped = Math.max(1600, Math.min(14000, bitrate))

  return Math.round(clamped / 100) * 100
}

async function createEncoderPlan(ffmpegPath, settings, outputSize, report) {
  const availableEncoders = await getAvailableVideoEncoders(ffmpegPath)
  const hardwareEncoder = getPreferredHardwareEncoder(availableEncoders)
  const wantsSoftware = settings.encoderMode === "software"
  const wantsHardware = settings.encoderMode === "hardware"

  if (!wantsSoftware && hardwareEncoder) {
    const bitrateKbps = getHardwareBitrateKbps(settings, outputSize)

    return {
      mode: "hardware",
      codec: hardwareEncoder,
      bitrateKbps,
      args: buildHardwareVideoEncoderArgs(hardwareEncoder, bitrateKbps)
    }
  }

  if (wantsHardware) {
    throw new Error("Hardware H.264 encoding was selected, but this FFmpeg build does not expose a supported hardware encoder.")
  }

  if (!availableEncoders.libx264) {
    throw new Error("This FFmpeg build does not expose libx264, so shortsCreator cannot encode H.264 output.")
  }

  if (!wantsSoftware) {
    report.log("Hardware H.264 encoder not available. Falling back to software libx264.")
  }

  return {
    mode: "software",
    codec: "libx264",
    bitrateKbps: 0,
    args: [
      "-c:v",
      "libx264",
      "-preset",
      settings.encoderPreset,
      "-crf",
      String(settings.crf),
      "-threads",
      "0"
    ]
  }
}

function buildHardwareVideoEncoderArgs(encoderName, bitrateKbps) {
  const args = [
    "-c:v",
    encoderName,
    "-b:v",
    `${bitrateKbps}k`,
    "-maxrate",
    `${Math.round(bitrateKbps * 1.35)}k`,
    "-bufsize",
    `${Math.round(bitrateKbps * 2)}k`
  ]

  if (encoderName === "h264_videotoolbox") {
    args.push("-profile:v", "high", "-realtime", "true", "-allow_sw", "true")
  }

  return args
}

function buildAudioEncoderArgs(videoInfo) {
  if (videoInfo.hasAudio && String(videoInfo.audioCodec || "").toLowerCase() === "aac") {
    return ["-c:a", "copy"]
  }

  return ["-c:a", "aac", "-b:a", "160k"]
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

function createCropLayoutFilter(outputSize, sourceSize) {
  const crop = getCenteredCrop(sourceSize, outputSize)

  if (!crop) {
    return `[0:v]scale=${outputSize.width}:${outputSize.height}:force_original_aspect_ratio=increase,crop=${outputSize.width}:${outputSize.height},setsar=1[laid]`
  }

  return `[0:v]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${outputSize.width}:${outputSize.height},setsar=1[laid]`
}

function createBaseLayoutFilter(layoutMode, segmentDuration, outputSize, sourceSize) {
  const width = outputSize.width
  const height = outputSize.height

  if (layoutMode === "crop") {
    return createCropLayoutFilter(outputSize, sourceSize)
  }

  if (layoutMode === "black") {
    return `color=c=black:s=${width}x${height}:d=${segmentDuration}[bg];[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[laid]`
  }

  return `[1:v]setsar=1[bg];[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[laid]`
}

function createLayoutFilter(options) {
  const filters = [
    createBaseLayoutFilter(options.layoutMode, options.segmentDuration, options.outputSize, options.sourceSize)
  ]

  const captionOverlay = options.assPath
    ? `${options.overlayFilterName}=filename='${escapeFilterPath(options.assPath)}'`
    : ""

  if (captionOverlay) {
    filters.push(`[laid][${options.titleInputIndex}:v]overlay=0:0[titled]`)
    filters.push(`[titled]${captionOverlay}[v]`)
  } else {
    filters.push(`[laid][${options.titleInputIndex}:v]overlay=0:0[v]`)
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
    `scale=${smallWidth}:${smallHeight}:force_original_aspect_ratio=increase,crop=${smallWidth}:${smallHeight},boxblur=3:1,scale=${outputSize.width}:${outputSize.height}`,
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

async function generatePart({ ffmpegPath, overlayFilterName, titleFontFile, encoderPlan, audioEncoderArgs, settings, sourceVideo, sourceSize, segment, plan, captions, report }) {
  const fileName = buildOutputFileName(settings.videoTitle, segment.index, plan.totalParts)
  const outputPath = getUniqueOutputPath(settings.outputFolder, fileName)
  const titleText = `${settings.videoTitle} - Part ${segment.index}`
  const segmentCaptions = filterCaptionsForSegment(captions, segment)
  const outputSize = getOutputSize(settings)
  const tempBackground = settings.layoutMode === "blurred"
    ? await createStaticBlurBackground({
      ffmpegPath,
      sourceVideo,
      segment,
      outputSize
    })
    : { imagePath: "", tempDir: "" }
  const tempTitle = await createTempTitleImage({
    titleText,
    fontPath: titleFontFile,
    highlightOpacity: settings.titleHighlightOpacity,
    outputWidth: outputSize.width,
    outputHeight: outputSize.height
  })
  const tempAss = segmentCaptions.length
    ? createTempAssFile({
      titleText: "",
      segment,
      settings,
      captions: segmentCaptions
    })
    : { assPath: "", tempDir: "" }

  try {
    const filter = createLayoutFilter({
      layoutMode: settings.layoutMode,
      segmentDuration: segment.duration,
      outputSize,
      sourceSize,
      titleInputIndex: settings.layoutMode === "blurred" ? 2 : 1,
      titleText,
      titleFontFile,
      settings,
      assPath: tempAss.assPath,
      overlayFilterName
    })

    report.log(`Writing ${path.basename(outputPath)} from ${formatSeconds(segment.start)} to ${formatSeconds(segment.end)}.`)

    const startedAt = Date.now()

    await runFfmpeg(ffmpegPath, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
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
      ] : []),
      "-loop",
      "1",
      "-framerate",
      "1",
      "-i",
      tempTitle.imagePath,
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
      ...encoderPlan.args,
      "-pix_fmt",
      "yuv420p",
      ...audioEncoderArgs,
      "-movflags",
      "+faststart",
      outputPath
    ])

    if (!fs.existsSync(outputPath)) {
      throw new Error(`FFmpeg finished but the output file was not created: ${outputPath}`)
    }

    report.log(`Finished ${path.basename(outputPath)} in ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} second(s).`)

    return outputPath
  } finally {
    cleanupTempDirectory(tempBackground.tempDir)
    cleanupTempTitleImage(tempTitle.tempDir)
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
  report.log(`Render settings: ${settings.layoutMode} layout, ${settings.outputResolution}, ${settings.encoderMode} encoder mode, ${settings.encoderPreset} preset, CRF ${settings.crf}.`)

  report.status("Preparing title and captions...")
  const captions = await prepareCaptions(settings, settings.sourceVideo, report)
  const overlayFilterName = captions.length ? await getFfmpegOverlayFilter(ffmpegPath) : ""
  const titleFontFile = await findFontFileByFamily(settings.titleFontFamily)
  const outputSize = getOutputSize(settings)
  const encoderPlan = await createEncoderPlan(ffmpegPath, settings, outputSize, report)
  const audioEncoderArgs = buildAudioEncoderArgs(videoInfo)

  if (captions.length && !overlayFilterName) {
    throw new Error("This FFmpeg build cannot burn captions. Choose an FFmpeg build with subtitles or ass filter support, or switch captions to No captions.")
  }

  report.log(`Using generated PNG title overlays${titleFontFile ? ` with font file: ${titleFontFile}.` : "."}`)
  report.log(encoderPlan.mode === "hardware"
    ? `Using hardware video encoder: ${encoderPlan.codec} at about ${encoderPlan.bitrateKbps}k.`
    : `Using software video encoder: libx264 ${settings.encoderPreset}, CRF ${settings.crf}.`)
  report.log(audioEncoderArgs.includes("copy") ? "Copying source AAC audio without re-encoding." : "Encoding audio to AAC 160k.")

  if (settings.parallelJobs > 1) {
    report.log(`Rendering up to ${settings.parallelJobs} part(s) at the same time.`)
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
        audioEncoderArgs,
        settings,
        sourceVideo: settings.sourceVideo,
        sourceSize: videoInfo,
        segment,
        plan,
        captions,
        report
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

module.exports = {
  createBaseLayoutFilter,
  createEncoderPlan,
  createCropLayoutFilter,
  createLayoutFilter,
  createStaticBlurBackground,
  getOutputSize,
  generatePart,
  generateVideoParts
}
