# shortsCreator

shortsCreator is a cross-platform desktop app for turning one long anime video essay into multiple vertical short-form videos for TikTok, YouTube Shorts, Instagram Reels, and similar platforms.

It is a normal Electron desktop app, not a Premiere Pro extension and not a browser-only localhost tool. End users download an installer from GitHub Releases, install shortsCreator, open it like any other app, choose a long video, and generate numbered vertical parts.

## Screenshots

Screenshots will be added after the first packaged UI pass is manually captured on macOS and Windows.

## What It Does

- reads one source video file: `.mp4`, `.mov`, `.mkv`, `.avi`, or `.m4v`
- converts each output part to vertical 9:16 video at `720x1280` or `1080x1920`
- creates `.mp4` files with H.264 video, AAC audio, and `yuv420p`
- splits by segment length or by desired number of parts
- supports intentional overlap/rewind between parts
- adds a top title label in the format `{Video Title} - Part {X}`
- lets you set the top title font family and highlight opacity
- loads installed system fonts as title font suggestions
- includes an encoder speed preset; `ultrafast` is the default for practical desktop rendering
- supports no captions or burning an existing full-video `.srt` file
- prepares architecture for future local Whisper-style caption generation
- uses secure Electron IPC with `contextIsolation: true`, `nodeIntegration: false`, and a preload bridge
- never modifies or deletes the source video

## Supported Platforms

- macOS
- Windows

Expected release artifacts:

- macOS: `shortsCreator.app` and `shortsCreator-x.x.x.dmg`
- Windows: `shortsCreator.exe` and `shortsCreator-Setup-x.x.x.exe`

## End User Installation

End users do not need Node.js, npm, Git, Codex, Adobe Premiere Pro, localhost, or a cloned repository.

1. Go to [GitHub Releases](https://github.com/ariqserazi/shortsCreator/releases).
2. Download the installer for your operating system.
3. Install shortsCreator.
4. Open shortsCreator like a normal desktop app.
5. Select one long video essay and generate vertical parts.

macOS users should download `shortsCreator-x.x.x.dmg`.

Windows users should download `shortsCreator-Setup-x.x.x.exe`.

## FFmpeg Setup

shortsCreator needs both `ffmpeg` and `ffprobe` to inspect and render video. Packaged releases include bundled FFmpeg and FFprobe binaries for the supported installer targets, so normal end users should not need to install FFmpeg separately.

Detection order:

1. saved custom `ffmpeg` and `ffprobe` paths
2. bundled app binaries
3. tools available on `PATH`
4. common macOS paths:
   - `/opt/homebrew/bin/ffmpeg`
   - `/opt/homebrew/bin/ffprobe`
   - `/usr/local/bin/ffmpeg`
   - `/usr/local/bin/ffprobe`
5. common Windows paths:
   - `C:\ffmpeg\bin\ffmpeg.exe`
   - `C:\ffmpeg\bin\ffprobe.exe`
   - `C:\Program Files\ffmpeg\bin\ffmpeg.exe`
   - `C:\Program Files\ffmpeg\bin\ffprobe.exe`

If detection fails, use `Choose ffmpeg` and `Choose ffprobe` in the app. shortsCreator saves those paths for future launches.

The app requires an FFmpeg build with subtitle/text overlay support because every generated part includes a top label like `{Video Title} - Part 1`. The bundled FFmpeg builds include that support. If you choose a custom FFmpeg path, make sure it has `subtitles`, `ass`, or `drawtext` filters.

The title font setting uses a font family name. The app loads installed system fonts as suggestions in the title font field. The selected font must be available to the operating system/fontconfig used by FFmpeg; otherwise FFmpeg/libass may fall back to a default font.

### macOS FFmpeg Install

```bash
brew install ffmpeg
```

### Windows FFmpeg Install

```powershell
winget install Gyan.FFmpeg
```

You can also download FFmpeg from [ffmpeg.org](https://ffmpeg.org/download.html), then select `ffmpeg.exe` and `ffprobe.exe` manually in shortsCreator.

## How To Use

1. Open shortsCreator.
2. Choose a source video file.
3. Choose an output folder.
4. Enter the video title.
5. Choose split mode: segment length or number of parts.
6. Set overlap/rewind seconds.
7. Choose a 9:16 layout mode.
8. Choose caption settings.
9. Click `Generate Parts`.
10. Use `Open Output Folder` to view the generated files.

Output filenames are sanitized and numbered, for example:

- `best-romance-anime-2026-part-01.mp4`
- `best-romance-anime-2026-part-02.mp4`
- `best-romance-anime-2026-part-03.mp4`

If a matching file already exists, shortsCreator writes a unique numbered variant instead of overwriting unrelated files.

## Split Modes

### Split By Segment Length

You choose how long each part should be.

Example: a 20 minute source video, 60 second segment length, and 5 second overlap creates:

- Part 1: `0:00` to `1:00`
- Part 2: `0:55` to `1:55`
- Part 3: `1:50` to `2:50`
- Part 4: `2:45` to `3:45`

The final part is trimmed to the end of the source video when needed.

### Split By Number Of Parts

You choose how many parts you want. shortsCreator calculates the segment length from the source duration and overlap so the planned parts cover the video.

## Overlap / Rewind

Overlap intentionally starts each part a few seconds before the previous part ended. This helps each new part feel less abrupt when watched as a series.

Rules:

- overlap must be `0` or greater
- overlap must be less than the segment length
- the source video is never modified

## Layout Modes

### Blurred Background

Default. A scaled, blurred copy fills the 1080x1920 canvas while the original video is centered on top. This works well for horizontal anime/video essay footage.

### Crop To Fill

The video is scaled and cropped to fill 1080x1920. This is useful for already vertical or center-focused content.

### Black Background

The original video is fit inside 1080x1920 with a black background. This is useful when you do not want blur.

## Captions

Caption source options:

- `No captions`
- `Use SRT file`
- `Auto-generate locally (future)`

The current working version supports no captions and importing an existing `.srt` file. The SRT should be timed against the full source video. shortsCreator slices and offsets subtitle cues for each generated part before burning them into the output.

Caption style settings include:

- TikTok style
- simple subtitles
- boxed subtitles
- font size
- vertical position

Local automatic captions are not faked. The `captionGenerator.js` module exists as the integration point for a future local Whisper-style tool such as `whisper.cpp` or `faster-whisper`, but automatic transcription is not fully implemented yet and does not use paid APIs or cloud services.

## Developer Setup

Developer requirements:

- Node.js
- npm
- FFmpeg and FFprobe for video generation testing

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run dev
```

Validate project structure and JavaScript syntax:

```bash
npm run validate
```

## Build Installers

Create an unpacked local build:

```bash
npm run build
```

Create a macOS DMG:

```bash
npm run build:mac
```

Create a Windows NSIS installer:

```bash
npm run build:win
```

Create installers for the current platform:

```bash
npm run dist
```

Installer output is written to `dist/`.

macOS installers are best built on macOS. Windows installers are best built on Windows or CI. Do not assume one OS can perfectly build and sign every platform.

## GitHub Releases

Distribution page:

[https://github.com/ariqserazi/shortsCreator/releases](https://github.com/ariqserazi/shortsCreator/releases)

Recommended release flow:

1. Run `npm install`.
2. On macOS, run `npm run build:mac`.
3. On Windows or Windows CI, run `npm run build:win`.
4. Upload generated files from `dist/` to a GitHub Release.
5. Users download the correct installer for their OS.

Expected upload names:

- `shortsCreator-x.x.x.dmg`
- `shortsCreator-Setup-x.x.x.exe`

## Unsigned App Warnings

Unsigned development builds may trigger operating system warnings:

- Windows may show Microsoft SmartScreen warnings.
- macOS may show Gatekeeper warnings.

Production releases should eventually use:

- Apple Developer ID signing and notarization for macOS
- a Windows code signing certificate for Windows

## Troubleshooting

### FFmpeg Is Missing

- Click `Check FFmpeg` in shortsCreator.
- Install FFmpeg with Homebrew, winget, Chocolatey, or a downloaded build.
- Use `Choose ffmpeg` and `Choose ffprobe` to select the binaries manually.
- Confirm both tools come from the same FFmpeg install.

### FFmpeg Fails On Captions

The current caption renderer uses FFmpeg subtitle/ASS support. Most standard FFmpeg builds include this. If your build does not, install a full FFmpeg build and select it manually.

### No Video Parts Were Generated

- Confirm the source video exists and uses a supported extension.
- Confirm the output folder is valid.
- Confirm the video title is not empty.
- Confirm overlap is less than segment length.
- Read the live log for FFmpeg errors.

### Rendering Is Slow

shortsCreator re-encodes each part to vertical H.264. Blurred background is more expensive than crop or black background because it creates both a blurred background layer and a foreground layer.

For faster generation:

- use `Output Size: 720x1280`
- try `Encoder Method: Auto hardware if available` or `Require hardware H.264`; some files are still faster with software x264
- try `Parallel Render Jobs: 2` on machines with enough CPU/GPU headroom
- use `Software Encoder Speed: Ultrafast` when using software x264
- use `Black background` or `Crop to fill` when blur is not needed
- use a higher CRF such as `23` or `24` for faster/smaller output
- keep captions off unless you need burned subtitles

The live log prints how long each generated part took.

### Automatic Captions Do Not Run

Automatic local transcription is planned but not implemented in this version. Use `No captions` or `Use SRT file`.

## License

MIT License. See [LICENSE](./LICENSE).
