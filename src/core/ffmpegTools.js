"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { execFile } = require("node:child_process")

const INSTALL_HELP = [
  "FFmpeg and ffprobe are required to generate clips.",
  "",
  "macOS: install FFmpeg with Homebrew, then run: brew install ffmpeg",
  "Windows: download FFmpeg from https://ffmpeg.org/download.html or install it with winget/chocolatey.",
  "",
  "You can also choose ffmpeg and ffprobe manually in shortsCreator. The app will save those paths for future launches."
].join("\n")

function getToolCandidates(toolName, savedPath) {
  const executableName = process.platform === "win32" ? `${toolName}.exe` : toolName
  const candidates = []

  if (savedPath) {
    candidates.push({
      path: savedPath,
      source: "saved"
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

async function detectFfmpegTools(savedPaths = {}) {
  const ffmpeg = await resolveToolPath("ffmpeg", savedPaths.ffmpegPath)
  const ffprobe = await resolveToolPath("ffprobe", savedPaths.ffprobePath)
  const ok = Boolean(ffmpeg && ffprobe)

  return {
    ok,
    ffmpegPath: ffmpeg ? ffmpeg.path : "",
    ffprobePath: ffprobe ? ffprobe.path : "",
    ffmpegSource: ffmpeg ? ffmpeg.source : "",
    ffprobeSource: ffprobe ? ffprobe.source : "",
    message: ok
      ? `Using ffmpeg: ${ffmpeg.path}\nUsing ffprobe: ${ffprobe.path}`
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

async function runFfmpeg(ffmpegPath, args) {
  await execFileAsync(ffmpegPath, args, {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10
  })
}

module.exports = {
  INSTALL_HELP,
  detectFfmpegTools,
  getVideoDuration,
  runFfmpeg
}
