import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const root = path.resolve(process.cwd())

const requiredFiles = [
  ".gitignore",
  "LICENSE",
  "README.md",
  "package.json",
  "scripts/validate.mjs",
  "src/main/main.js",
  "src/main/preload.js",
  "src/main/ipcHandlers.js",
  "src/renderer/index.html",
  "src/renderer/styles.css",
  "src/renderer/app.js",
  "src/core/clipGenerator.js",
  "src/core/ffmpegTools.js",
  "src/core/settingsStore.js",
  "src/core/validation.js",
  "src/core/videoScanner.js",
  "src/assets/icons/README.md"
]

const removedPaths = [
  ".debug",
  "CSXS",
  "jsx",
  "lib",
  "scripts/zip.mjs",
  "index.html"
]

for (const relativeFile of requiredFiles) {
  const absoluteFile = path.join(root, relativeFile)

  if (!fs.existsSync(absoluteFile)) {
    throw new Error(`Missing required file: ${relativeFile}`)
  }
}

for (const relativePath of removedPaths) {
  const absolutePath = path.join(root, relativePath)

  if (fs.existsSync(absolutePath)) {
    throw new Error(`Removed extension path should not remain: ${relativePath}`)
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"))

if (packageJson.name !== "shortscreator") {
  throw new Error("package.json name must be shortscreator.")
}

if (packageJson.build?.productName !== "shortsCreator") {
  throw new Error("electron-builder productName must be shortsCreator.")
}

for (const scriptName of ["dev", "start", "build", "build:mac", "build:win", "dist", "validate"]) {
  if (!packageJson.scripts?.[scriptName]) {
    throw new Error(`Missing package script: ${scriptName}`)
  }
}

const sourceFilesToCheck = [
  "scripts/validate.mjs",
  "src/main/main.js",
  "src/main/preload.js",
  "src/main/ipcHandlers.js",
  "src/renderer/app.js",
  "src/core/clipGenerator.js",
  "src/core/ffmpegTools.js",
  "src/core/settingsStore.js",
  "src/core/validation.js",
  "src/core/videoScanner.js"
]

for (const relativeFile of sourceFilesToCheck) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativeFile)], {
    encoding: "utf8"
  })

  if (result.status !== 0) {
    throw new Error(`Syntax check failed for ${relativeFile}\n${result.stderr}`)
  }
}

console.log("shortsCreator validation passed.")
