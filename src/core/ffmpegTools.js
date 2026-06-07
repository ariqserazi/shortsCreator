"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { execFile } = require("node:child_process")

const INSTALL_HELP = [
  "FFmpeg and ffprobe are required to generate video parts. shortsCreator includes bundled FFmpeg tools for packaged builds.",
  "",
  "If the bundled tools are unavailable for your platform, install FFmpeg manually.",
  "macOS: install FFmpeg with Homebrew, then run: brew install ffmpeg",
  "Windows: download FFmpeg from https://ffmpeg.org/download.html or install it with winget/chocolatey.",
  "",
  "You can also choose ffmpeg and ffprobe manually in shortsCreator. The app will save those paths for future launches."
].join("\n")

const OVERLAY_HELP = [
  "FFmpeg and ffprobe were found, but this FFmpeg build is missing filters required for the selected render settings.",
  "",
  "No-caption jobs need standard scale/overlay filters. SRT caption jobs also need subtitles or ass filter support.",
  "",
  "Use the bundled FFmpeg, or install a fuller FFmpeg build and choose that ffmpeg manually in shortsCreator."
].join("\n")

function getPlatformArchKey() {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "darwin-arm64"
  }

  if (process.platform === "win32" && process.arch === "x64") {
    return "win32-x64"
  }

  return `${process.platform}-${process.arch}`
}

function getBundledToolPaths(toolName) {
  const platformArch = getPlatformArchKey()
  const executableName = process.platform === "win32" ? `${toolName}.exe` : toolName
  const candidates = []

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "vendor", toolName, platformArch, executableName))
  }

  candidates.push(path.join(__dirname, "..", "..", "vendor", toolName, platformArch, executableName))

  return Array.from(new Set(candidates))
}

function getToolCandidates(toolName, savedPath) {
  const executableName = process.platform === "win32" ? `${toolName}.exe` : toolName
  const candidates = []

  if (savedPath) {
    candidates.push({
      path: savedPath,
      source: "saved"
    })
  }

  for (const bundledPath of getBundledToolPaths(toolName)) {
    candidates.push({
      path: bundledPath,
      source: "bundled"
    })
  }

  candidates.push({
    path: executableName,
    source: "PATH"
  })

  if (process.platform === "darwin") {
    candidates.push(
      {
        path: path.join("/opt", "homebrew", "bin", toolName),
        source: "common macOS path"
      },
      {
        path: path.join("/usr", "local", "bin", toolName),
        source: "common macOS path"
      }
    )
  }

  if (process.platform === "win32") {
    candidates.push(
      {
        path: path.win32.join("C:\\", "ffmpeg", "bin", `${toolName}.exe`),
        source: "common Windows path"
      },
      {
        path: path.win32.join("C:\\", "Program Files", "ffmpeg", "bin", `${toolName}.exe`),
        source: "common Windows path"
      }
    )
  }

  return candidates
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      env: options.env || process.env,
      maxBuffer: options.maxBuffer || 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || stdout || error.message).trim()))
        return
      }

      resolve({
        stdout: stdout || "",
        stderr: stderr || ""
      })
    })
  })
}

async function isRunnableTool(candidatePath) {
  if (path.isAbsolute(candidatePath) && !fs.existsSync(candidatePath)) {
    return false
  }

  try {
    await execFileAsync(candidatePath, ["-version"], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024
    })
    return true
  } catch (error) {
    return false
  }
}

async function resolveToolPath(toolName, savedPath) {
  const candidates = getToolCandidates(toolName, savedPath)

  for (const candidate of candidates) {
    if (await isRunnableTool(candidate.path)) {
      return candidate
    }
  }

  return null
}

async function resolveFfmpegPath(savedPath, options = {}) {
  const candidates = getToolCandidates("ffmpeg", savedPath)

  for (const candidate of candidates) {
    if (await isRunnableTool(candidate.path)) {
      const hasOverlay = await hasFfmpegOverlay(candidate.path)
      const overlayFilter = await getFfmpegOverlayFilter(candidate.path)

      if (hasOverlay && (!options.requireCaptionOverlay || overlayFilter)) {
        return Object.assign({}, candidate, {
          hasOverlay,
          overlayFilter
        })
      }
    }
  }

  return null
}

async function detectFfmpegTools(savedPaths = {}) {
  const ffmpeg = await resolveFfmpegPath(savedPaths.ffmpegPath, {
    requireCaptionOverlay: savedPaths.captionSource === "srt"
  })
  const ffprobe = await resolveToolPath("ffprobe", savedPaths.ffprobePath)
  const ok = Boolean(ffmpeg && ffprobe)

  return {
    ok,
    ffmpegPath: ffmpeg ? ffmpeg.path : "",
    ffprobePath: ffprobe ? ffprobe.path : "",
    ffmpegSource: ffmpeg ? ffmpeg.source : "",
    ffprobeSource: ffprobe ? ffprobe.source : "",
    hasOverlay: ffmpeg ? ffmpeg.hasOverlay : false,
    overlayFilter: ffmpeg ? ffmpeg.overlayFilter : "",
    message: ok
      ? `Using ffmpeg: ${ffmpeg.path}\nUsing ffprobe: ${ffprobe.path}\nOverlay filter: ${ffmpeg.overlayFilter}`
      : ffprobe
        ? OVERLAY_HELP
        : INSTALL_HELP
  }
}

async function getVideoDuration(ffprobePath, filePath) {
  const result = await execFileAsync(ffprobePath, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    filePath
  ], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024
  })

  const rawDuration = String(result.stdout || "").trim()
  const duration = Number(rawDuration)

  if (!rawDuration || !Number.isFinite(duration)) {
    return null
  }

  return duration
}

async function getFfmpegFilters(ffmpegPath) {
  const result = await execFileAsync(ffmpegPath, [
    "-hide_banner",
    "-filters"
  ], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 4
  })

  return String(result.stdout || result.stderr || "")
}

async function getFfmpegEncoders(ffmpegPath) {
  const result = await execFileAsync(ffmpegPath, [
    "-hide_banner",
    "-encoders"
  ], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 4
  })

  return String(result.stdout || result.stderr || "")
}

async function getFfmpegOverlayFilter(ffmpegPath) {
  const filters = await getFfmpegFilters(ffmpegPath)

  if (hasFfmpegFilter(filters, "subtitles")) {
    return "subtitles"
  }

  if (hasFfmpegFilter(filters, "ass")) {
    return "ass"
  }

  return ""
}

function hasFfmpegFilter(filters, filterName) {
  return new RegExp(`(^|\\n)\\s*\\S+\\s+${filterName}\\s+`, "m").test(filters)
}

function hasFfmpegEncoder(encoders, encoderName) {
  return new RegExp(`(^|\\n)\\s*\\S+\\s+${encoderName}\\s+`, "m").test(encoders)
}

async function getAvailableVideoEncoders(ffmpegPath) {
  const encoders = await getFfmpegEncoders(ffmpegPath)

  return {
    libx264: hasFfmpegEncoder(encoders, "libx264"),
    h264_videotoolbox: hasFfmpegEncoder(encoders, "h264_videotoolbox"),
    h264_nvenc: hasFfmpegEncoder(encoders, "h264_nvenc"),
    h264_qsv: hasFfmpegEncoder(encoders, "h264_qsv"),
    h264_amf: hasFfmpegEncoder(encoders, "h264_amf")
  }
}

async function hasFfmpegDrawtext(ffmpegPath) {
  return hasFfmpegFilter(await getFfmpegFilters(ffmpegPath), "drawtext")
}

async function hasFfmpegOverlay(ffmpegPath) {
  const filters = await getFfmpegFilters(ffmpegPath)
  return hasFfmpegFilter(filters, "overlay") && hasFfmpegFilter(filters, "scale")
}

async function runFfprobeJson(ffprobePath, args) {
  const result = await execFileAsync(ffprobePath, [
    "-of",
    "json",
    ...args
  ], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10
  })

  try {
    return JSON.parse(result.stdout || "{}")
  } catch (error) {
    throw new Error(`Could not parse ffprobe output: ${error.message}`)
  }
}

async function runFfmpeg(ffmpegPath, args) {
  await execFileAsync(ffmpegPath, args, {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10
  })
}

module.exports = {
  INSTALL_HELP,
  OVERLAY_HELP,
  detectFfmpegTools,
  getAvailableVideoEncoders,
  getFfmpegEncoders,
  getFfmpegFilters,
  getFfmpegOverlayFilter,
  getPlatformArchKey,
  hasFfmpegDrawtext,
  hasFfmpegOverlay,
  getVideoDuration,
  runFfprobeJson,
  runFfmpeg
}
