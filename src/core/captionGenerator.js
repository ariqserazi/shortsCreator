"use strict"

function isAutoCaptionAvailable() {
  return false
}

async function generateLocalCaptions() {
  throw new Error("Local automatic caption generation is prepared for future Whisper-style integration, but it is not implemented yet. Choose No captions or Use SRT file for this version.")
}

module.exports = {
  generateLocalCaptions,
  isAutoCaptionAvailable
}
