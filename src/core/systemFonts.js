"use strict"

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { execFile } = require("node:child_process")

const COMMON_FONT_FAMILIES = Object.freeze([
  "Arial",
  "Arial Black",
  "Impact",
  "Helvetica",
  "Helvetica Neue",
  "Times New Roman",
  "Verdana",
  "Trebuchet MS",
  "Georgia",
  "Courier New"
])

let fontRecordCache = null

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      encoding: "utf8",
      maxBuffer: options.maxBuffer || 1024 * 1024 * 24,
      timeout: options.timeout || 20000,
      windowsHide: true
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || stdout || error.message).trim()))
        return
      }

      resolve(stdout || "")
    })
  })
}

function normalizeFontName(value) {
  return String(value || "")
    .replace(/\.(ttf|ttc|otf|dfont)$/i, "")
    .replace(/\s+\((true|open)type\)$/i, "")
    .replace(/\s+(regular|bold|italic|light|medium|semibold|black|thin|heavy|condensed|narrow)$/i, "")
    .replace(/[-_]+(regular|bold|italic|light|medium|semibold|black|thin|heavy|condensed|narrow)$/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

function addFontName(fonts, value) {
  const normalized = normalizeFontName(value)

  if (normalized && normalized.length <= 100 && !normalized.startsWith(".")) {
    fonts.add(normalized)
  }
}

function addFontRecord(records, value, filePath) {
  const family = normalizeFontName(value)

  if (family && family.length <= 100 && !family.startsWith(".") && filePath) {
    records.push({
      family,
      path: filePath
    })
  }
}

async function listMacFonts() {
  const records = []
  const profilerPath = "/usr/sbin/system_profiler"

  if (fs.existsSync(profilerPath)) {
    const stdout = await execFileAsync(profilerPath, ["SPFontsDataType", "-json"])
    const parsed = JSON.parse(stdout)

    for (const font of parsed.SPFontsDataType || []) {
      for (const typeface of font.typefaces || []) {
        addFontRecord(records, typeface.family || typeface.fullname || typeface._name, font.path)
      }
    }
  }

  return records
}

async function listWindowsFonts() {
  const records = []
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe"
  const registryCommand = [
    "$paths=@('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts','HKCU:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts');",
    "$items=@();",
    "foreach($p in $paths){if(Test-Path $p){$items += (Get-ItemProperty $p).PSObject.Properties | Where-Object {$_.Name -notlike 'PS*'} | ForEach-Object {[PSCustomObject]@{Name=$_.Name;Value=$_.Value}}}};",
    "$items | ConvertTo-Json -Compress"
  ].join(" ")

  try {
    const stdout = await execFileAsync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", registryCommand])
    const parsed = JSON.parse(stdout || "[]")
    const items = Array.isArray(parsed) ? parsed : [parsed]
    const fontDir = path.join(process.env.SystemRoot || "C:\\Windows", "Fonts")

    for (const item of items) {
      const fontPath = path.isAbsolute(String(item.Value || ""))
        ? String(item.Value)
        : path.join(fontDir, String(item.Value || ""))
      addFontRecord(records, item.Name, fontPath)
    }
  } catch (error) {
    return records
  }

  return records
}

function scanFontDirectories() {
  const records = []
  const directories = []

  if (process.platform === "darwin") {
    directories.push(
      "/System/Library/Fonts",
      "/System/Library/Fonts/Supplemental",
      "/Library/Fonts",
      path.join(os.homedir(), "Library", "Fonts")
    )
  } else if (process.platform === "win32") {
    directories.push(path.join(process.env.SystemRoot || "C:\\Windows", "Fonts"))
  }

  for (const directory of directories) {
    if (!fs.existsSync(directory)) {
      continue
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && /\.(ttf|ttc|otf|dfont)$/i.test(entry.name)) {
        addFontRecord(records, entry.name, path.join(directory, entry.name))
      }
    }
  }

  return records
}

async function listSystemFontRecords() {
  if (fontRecordCache) {
    return fontRecordCache
  }

  const records = []

  try {
    if (process.platform === "darwin") {
      records.push(...await listMacFonts())
    } else if (process.platform === "win32") {
      records.push(...await listWindowsFonts())
    }
  } catch (error) {
    // Folder scanning below keeps the picker useful if rich OS metadata is unavailable.
  }

  records.push(...scanFontDirectories())
  fontRecordCache = records

  return fontRecordCache
}

async function listSystemFonts() {
  const fonts = new Set(COMMON_FONT_FAMILIES)

  for (const record of await listSystemFontRecords()) {
    addFontName(fonts, record.family)
  }

  return Array.from(fonts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
}

async function findFontFileByFamily(fontFamily) {
  const requested = normalizeFontName(fontFamily).toLowerCase()

  if (!requested) {
    return ""
  }

  const quickRecords = scanFontDirectories()
  const quickExact = quickRecords.find((record) => record.family.toLowerCase() === requested && fs.existsSync(record.path))

  if (quickExact) {
    return quickExact.path
  }

  const records = await listSystemFontRecords()
  const exact = records.find((record) => record.family.toLowerCase() === requested && fs.existsSync(record.path))

  if (exact) {
    return exact.path
  }

  const loose = records.find((record) => {
    const family = record.family.toLowerCase()
    return fs.existsSync(record.path) && (family.includes(requested) || requested.includes(family))
  })

  return loose ? loose.path : ""
}

module.exports = {
  findFontFileByFamily,
  listSystemFontRecords,
  listSystemFonts,
  normalizeFontName
}
