"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { getVideoDuration, runFfmpeg } = require("./ffmpegTools")
const { scanVideoFiles } = require("./videoScanner")
const { ensureOutputFolder, validateGenerationSettings } = require("./validation")

function noop() {}

function createReporter(reporter = {}) {
  return {
    log: typeof reporter.log === "function" ? reporter.log : noop,
    progress: typeof reporter.progress === "function" ? reporter.progress : noop,
    status: typeof reporter.status === "function" ? reporter.status : noop,
    generated: typeof reporter.generated === "function" ? reporter.generated : noop
  }
}

function formatClipName(index) {
  return `broll_${String(index).padStart(4, "0")}.mp4`
}

async function getUsableSource(ffprobePath, settings, sourcePath, report) {
  const durationRaw = await getVideoDuration(ffprobePath, sourcePath)
  const duration = durationRaw === null ? null : Math.floor(durationRaw)
  const minStart = settings.skipFirstSeconds

  if (duration === null) {
    report.log(`Could not read duration. Skipping: ${sourcePath}`)
    return null
  }

  const maxStart = duration - settings.clipLength - settings.skipLastSeconds

  if (maxStart < minStart) {
    report.log(`Video too short for the current settings. Skipping: ${sourcePath}`)
    return null
  }

  return {
    sourcePath,
    duration,
    minStart,
    maxStart
  }
}

async function buildSequentialClipPlan(ffprobePath, settings, sourceFiles, report) {
  const plan = []

  for (const sourcePath of sourceFiles) {
    const usableSource = await getUsableSource(ffprobePath, settings, sourcePath, report)

    if (!usableSource) {
      continue
    }

    for (let start = usableSource.minStart; start <= usableSource.maxStart; start += settings.clipLength) {
      plan.push({
        sourcePath,
        start
      })

      if (plan.length >= settings.clipCount) {
        return plan
      }
    }
  }

  return plan
}

async function buildRandomClipPlan(ffprobePath, settings, sourceFiles, report) {
  const usableSources = []

  for (const sourcePath of sourceFiles) {
    const usableSource = await getUsableSource(ffprobePath, settings, sourcePath, report)

    if (usableSource) {
      usableSources.push(usableSource)
    }
  }

  if (!usableSources.length) {
    return []
  }

  return Array.from({ length: settings.clipCount }, () => {
    const source = usableSources[Math.floor(Math.random() * usableSources.length)]
    const start = Math.floor(Math.random() * (source.maxStart - source.minStart + 1)) + source.minStart

    return {
      sourcePath: source.sourcePath,
      start
    }
  })
}

async function generatePlannedClip(ffmpegPath, settings, index, plannedClip, report) {
  const outputName = formatClipName(index)
  const outputPath = path.join(settings.outputFolder, outputName)

  if (fs.existsSync(outputPath)) {
    report.log(`Warning: overwriting existing generated clip: ${outputPath}`)
  }

  report.log(`Creating ${outputName} from ${path.basename(plannedClip.sourcePath)} at ${plannedClip.start} seconds...`)

  await runFfmpeg(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    String(plannedClip.start),
    "-i",
    plannedClip.sourcePath,
    "-t",
    String(settings.clipLength),
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    outputPath
  ])

  return outputPath
}

async function generateClips(options = {}) {
  const report = createReporter(options.reporter)
  const ffmpegPath = options.ffmpegPath
  const ffprobePath = options.ffprobePath

  if (!ffmpegPath || !ffprobePath) {
    throw new Error("ffmpeg and ffprobe are required before clips can be generated.")
  }

  const settings = validateGenerationSettings(options.settings)
  const outputResult = ensureOutputFolder(settings.outputFolder)
  const generatedFiles = []

  if (outputResult.created) {
    report.log(`Created output folder: ${outputResult.path}`)
  }

  const sourceFiles = scanVideoFiles(settings.inputFolder, settings.outputFolder)

  if (!sourceFiles.length) {
    throw new Error(`No supported video files were found in: ${settings.inputFolder}`)
  }

  report.log(`Found ${sourceFiles.length} video file(s).`)
  report.log(`Input folder: ${settings.inputFolder}`)
  report.log(`Output folder: ${settings.outputFolder}`)
  report.log(`Randomize start times: ${settings.randomizeStartTimes ? "On" : "Off"}`)

  const plan = settings.randomizeStartTimes
    ? await buildRandomClipPlan(ffprobePath, settings, sourceFiles, report)
    : await buildSequentialClipPlan(ffprobePath, settings, sourceFiles, report)

  if (!plan.length) {
    throw new Error("No usable clips could be planned from the current source files and settings.")
  }

  if (!settings.randomizeStartTimes) {
    report.log("Sequential mode is on. Clips will move forward through each source file before switching to the next one.")

    if (plan.length < settings.clipCount) {
      report.log(`Only ${plan.length} sequential clip(s) fit within the available source footage.`)
    }
  }

  for (let index = 1; index <= plan.length; index += 1) {
    const plannedClip = plan[index - 1]
    report.status(`Generating clip ${index} of ${plan.length}...`)
    report.progress({
      current: index - 1,
      total: plan.length,
      percent: Math.round(((index - 1) / plan.length) * 100)
    })

    try {
      const generatedPath = await generatePlannedClip(ffmpegPath, settings, index, plannedClip, report)
      generatedFiles.push(generatedPath)
      report.generated(generatedPath)
    } catch (error) {
      report.log(`ffmpeg failed while creating ${formatClipName(index)}:`)
      report.log(error.message)
    }

    report.progress({
      current: index,
      total: plan.length,
      percent: Math.round((index / plan.length) * 100)
    })
  }

  report.status(`Finished. Created ${generatedFiles.length} clip(s).`)
  report.log(`Done. Clips saved to: ${settings.outputFolder}`)

  return {
    generatedFiles,
    outputFolder: settings.outputFolder,
    sourceCount: sourceFiles.length,
    plannedCount: plan.length
  }
}

module.exports = {
  buildRandomClipPlan,
  buildSequentialClipPlan,
  formatClipName,
  generateClips,
  generatePlannedClip
}
