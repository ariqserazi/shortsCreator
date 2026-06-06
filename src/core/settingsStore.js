"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { DEFAULT_SETTINGS, normalizeSettings } = require("./validation")

class SettingsStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, "settings.json")
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return Object.assign({}, DEFAULT_SETTINGS)
      }

      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"))
      return normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, parsed))
    } catch (error) {
      return Object.assign({}, DEFAULT_SETTINGS)
    }
  }

  save(settings) {
    const nextSettings = normalizeSettings(settings)
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(nextSettings, null, 2))
    return nextSettings
  }

  update(partialSettings) {
    return this.save(Object.assign({}, this.load(), partialSettings || {}))
  }
}

module.exports = {
  SettingsStore
}
