# shortsCreator

shortsCreator is a desktop app for turning one long video into numbered short-form parts for TikTok, YouTube Shorts, Instagram Reels, and similar platforms.

Windows users launch it from the included `.bat` file. They download the repo ZIP, unzip it, double-click `shortsCreator-windows.bat`, choose a source video, choose split/render settings, and generate `.mp4` files. The source video is never modified.

## Windows Quick Start

1. Open the GitHub repo page.
2. Click `Code`, then `Download ZIP`.
3. Unzip the downloaded folder.
4. Open the unzipped folder.
5. Double-click:

   ```text
   shortsCreator-windows.bat
   ```

The `.bat` file is the Windows launcher. It installs Node.js LTS automatically with Windows Package Manager if `npm` is missing, repairs app dependencies, checks the project files, and then opens shortsCreator.

The first run can take a few minutes. Later runs should open much faster.

If startup fails, send the error shown in the terminal window plus this log file:

```text
windows-launch.log
```

Important: Windows users should not download only the `.bat` file by itself. The `.bat` file needs the rest of the repo files next to it.

## Windows Notes

- Users do not need Git, Codex, or Adobe Premiere Pro.
- Users do not need to install Node.js manually when Windows Package Manager is available.
- If Windows Package Manager is missing or blocked, install Node.js LTS from [nodejs.org](https://nodejs.org/), then run `shortsCreator-windows.bat` again.
- If Windows warns about running a downloaded `.bat` file, choose to keep/run it only if you downloaded it from the correct repo.
- `build-windows-exe.bat` is kept only for compatibility and forwards to `shortsCreator-windows.bat`.

## macOS

Download the macOS `.dmg` from [GitHub Releases](https://github.com/ariqserazi/shortsCreator/releases), or build it from this repo on macOS:

```text
build-mac-dmg.command
```

Double-click it to build:

```text
dist/shortsCreator-1.0.0.dmg
```

The macOS launcher runs `npm install` first if `node_modules` is missing, then opens the `dist/` folder when the build finishes.

## Developer Installer Builds

The recommended Windows path is `shortsCreator-windows.bat`, not an installer. If you still want to create a Windows NSIS installer manually, run:

```text
npm run build:win
```

Installer output is written to `dist/`.

## Current Features

- Reads one source video file: `.mp4`, `.mov`, `.mkv`, `.avi`, or `.m4v`
- Splits by segment length or by desired number of parts
- Supports overlap/rewind between parts
- Generates numbered output files like `my-video-part-01.mp4`
- Avoids overwriting existing output files by creating unique names
- Creates vertical `720x1280` or `1080x1920` styled videos
- Includes a Cut Only mode for extremely fast stream-copy splitting
- Supports crop, black background, and blurred background layouts
- Adds an optional top title label: `{Video Title} - Part {X}`
- Lets you choose title font family and highlight opacity
- Loads installed system fonts as title font suggestions
- Supports no captions or burning an existing full-video `.srt` file
- Supports TikTok, simple, and boxed caption styles
- Has render presets for Fast, Balanced, High Quality, and Cut Only
- Supports Auto, Hardware, and Software encoder modes
- Uses hardware H.264 encoders when available, with software fallback in Auto mode
- Copies audio first when possible and retries with AAC if audio copy fails
- Shows FFmpeg progress, speed, and live logs while rendering
- Includes a 10-second speed test render button
- Includes bundled FFmpeg/FFprobe for Windows launcher and packaged builds

Automatic local transcription is planned but not implemented yet. The app does not fake captions and does not use paid APIs or cloud transcription services.

## Quick Start

1. Open shortsCreator.
2. Choose a source video.
3. Choose an output folder.
4. Enter a video title.
5. Pick a render preset.
6. Choose split mode: segment length or number of parts.
7. Set overlap/rewind seconds.
8. Adjust layout, encoder, title, or caption settings if needed.
9. Optional: click `Render 10-second speed test`.
10. Click `Generate Parts`.
11. Click `Open Output Folder` to view generated files.

## Render Presets

### Fast

Best default for quick styled Shorts/Reels/TikToks.

- Default output: `720x1280`
- Default layout: Crop to fill
- Encoder mode: Auto / Recommended
- Prefers hardware H.264 when available
- Uses faster scaling for speed
- Keeps title and captions optional

### Balanced

Better quality while still preferring hardware acceleration.

- Default output: `1080x1920`
- Default layout: Crop to fill
- Encoder mode: Auto / Recommended
- Allows title labels and captions
- Allows blurred background, but blur is slower

### High Quality

Best when quality/compression matters more than speed.

- Default output: `1080x1920`
- Uses software `libx264`
- Uses CRF-based quality
- Slower than Fast and Balanced

### Cut Only / No Styling

Fastest possible splitting mode.

- No 9:16 conversion
- No crop, scale, blur, title label, or captions
- Keeps the original aspect ratio
- Uses FFmpeg stream copy: `-c copy`
- Useful when you only want to split a source video quickly

Cut Only does not create vertical TikTok/Shorts/Reels layout.

## Split Settings

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

### Overlap / Rewind

Overlap intentionally starts each part a few seconds before the previous part ended. This helps each new part feel less abrupt when watched as a series.

Rules:

- overlap must be `0` or greater
- overlap must be less than the segment length
- the source video is never modified

## Layout Modes

### Crop To Fill

The video is center-cropped and scaled to fill the selected vertical output size. This is the fastest styled layout and works well for center-focused content.

### Black Background

The original video is fit inside the selected vertical output size with a black background. This avoids cropping.

### Blurred Background

A scaled, blurred copy fills the selected output canvas while the original video is centered on top. It can look nicer for horizontal footage, but it is slower than crop or black background.

## Output Settings

### Output Resolution

- `720x1280`: faster, recommended for Fast preset
- `1080x1920`: higher resolution, slower

### Title Label

The `Show Title Label` setting controls the top title overlay. When enabled, each part gets:

`{Video Title} - Part {X}`

Title settings include:

- font family
- title highlight opacity
- installed system font suggestions

If title label and captions are both off, shortsCreator skips the ASS/subtitle overlay filter.

## Captions

Caption source options:

- `No captions`
- `Use SRT file`
- `Auto-generate locally (future)`

SRT captions should be timed against the full source video. shortsCreator slices and offsets subtitle cues for each generated part before burning them into the output.

Caption style settings include:

- TikTok style
- simple subtitles
- boxed subtitles
- font size
- vertical position

Captions are disabled in Cut Only mode because Cut Only uses stream copy and does not run video filters.

## Encoder Settings

### Encoder Mode

- `Auto / Recommended`: chooses a supported hardware H.264 encoder when available, otherwise falls back to software
- `Require hardware H.264`: fails if a supported hardware encoder is not available
- `Software x264`: uses `libx264`

### Hardware Encoder Preference

On macOS, shortsCreator prefers:

- `h264_videotoolbox`

On Windows, shortsCreator tries:

1. `h264_nvenc`
2. `h264_qsv`
3. `h264_amf`
4. `libx264` fallback

The app detects encoders by running:

```bash
ffmpeg -hide_banner -encoders
```

### Software Encoder Speed

The software encoder speed setting applies to `libx264`. Faster presets render more quickly but can create larger files.

### Parallel Render Jobs

Parallel jobs can be set to:

- `1`
- `2`

Use `2` on faster machines to render two parts at once. If you see hardware encoder errors, set this back to `1`.

## Speed Test

Click `Render 10-second speed test` to render a 10-second sample with the current settings.

The log reports elapsed time and estimated realtime speed, for example:

`10-second test completed in 3.2 seconds. Estimated speed: 3.1x realtime.`

Use this before rendering a long video if you are trying new settings.

## FFmpeg And FFprobe

shortsCreator needs both FFmpeg and FFprobe.

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

Use `Check FFmpeg` in the app to see what was detected.

Use `Choose ffmpeg` and `Choose ffprobe` if you want to select custom binaries manually.

### Bundled Vendor Files

The project expects platform-specific FFmpeg files in:

- macOS FFmpeg: `vendor/ffmpeg/darwin-arm64/ffmpeg`
- macOS FFprobe: `vendor/ffprobe/darwin-arm64/ffprobe`
- Windows FFmpeg: `vendor/ffmpeg/win32-x64/ffmpeg.exe`
- Windows FFprobe: `vendor/ffprobe/win32-x64/ffprobe.exe`

macOS will not use the Windows `.exe`, and Windows will not use the macOS binary. Keeping both sets in the repo is fine, though it can make installer builds larger.

## Developer Build Commands

Normal Windows users do not need this section. They should use `shortsCreator-windows.bat`.

Developer requirements:

- Node.js LTS
- npm
- this repository cloned locally

Install dependencies:

```bash
npm install
```

Validate project structure and JavaScript syntax:

```bash
npm run validate
```

Run the desktop app in development:

```bash
npm run dev
```

### Manual Build Commands

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

macOS installers are best built on macOS. Windows installers are best built on Windows or Windows CI. Do not assume one OS can perfectly build and sign every platform.

## Distribution Flow

Windows distribution:

1. Push the repo to GitHub.
2. Tell Windows users to download the repo ZIP from the GitHub `Code` button.
3. Tell them to unzip it and double-click `shortsCreator-windows.bat`.

macOS release flow:

1. Run `npm install`.
2. Run `npm run validate`.
3. Run `build-mac-dmg.command` or `npm run build:mac`.
4. Upload the generated DMG from `dist/` to a GitHub Release.

Expected macOS upload name:

- `shortsCreator-1.0.0.dmg`

## Unsigned App Warnings

Unsigned development builds may trigger operating system warnings:

- Windows may show Microsoft SmartScreen warnings.
- macOS may show Gatekeeper warnings.

Production releases should eventually use:

- Apple Developer ID signing and notarization for macOS
- a Windows code signing certificate for Windows

## Troubleshooting

### Windows Launcher Does Not Open

Use the full repo ZIP, not just the `.bat` file by itself.

If `shortsCreator-windows.bat` fails:

1. Keep the terminal window open.
2. Read the error shown there.
3. Open `windows-launch.log` in the same folder.
4. Send both the terminal error and `windows-launch.log`.

Common fixes:

- If `npm` is missing and Windows Package Manager is unavailable, install Node.js LTS from [nodejs.org](https://nodejs.org/) and run the `.bat` again.
- If Electron did not install correctly, delete the `node_modules` folder and run the `.bat` again.
- If FFmpeg is missing, download the full repo ZIP again so the `vendor/` folder is included.
- If Windows blocks the downloaded file, confirm it came from the correct repo, then choose to keep/run it.

### FFmpeg Is Missing

- Click `Check FFmpeg`.
- Confirm the bundled `vendor/` files exist for your platform.
- Install FFmpeg manually with Homebrew, winget, Chocolatey, or a downloaded build.
- Use `Choose ffmpeg` and `Choose ffprobe` to select binaries manually.

### FFmpeg Fails On Title Or Captions

Styled renders with title labels or burned captions need FFmpeg `subtitles` or `ass` filter support. The bundled FFmpeg builds include this. If a custom FFmpeg build does not, install/select a fuller FFmpeg build or disable title/captions.

### Rendering Is Slow

For faster generation:

- use `Render Preset: Fast`
- use `Output Resolution: 720x1280`
- use `Layout: Crop to fill`
- use `Encoder Mode: Auto / Recommended`
- try `Parallel Render Jobs: 2`
- turn captions off unless you need burned subtitles
- use `Cut Only / No Styling` when you only need quick splitting and do not need vertical output

Blurred background is slower because it creates a background image layer and extra scaling/blur work.

If speed suddenly becomes much worse, make sure old shortsCreator windows/helper processes are not still running.

### Cut Only Is Not Vertical

That is expected. Cut Only keeps the original source layout because it uses stream copy and avoids all filters.

### No Video Parts Were Generated

- Confirm the source video exists and uses a supported extension.
- Confirm the output folder is valid.
- Confirm the video title is not empty.
- Confirm overlap is less than segment length.
- Read the live log for FFmpeg errors.

### Automatic Captions Do Not Run

Automatic local transcription is planned but not implemented in this version. Use `No captions` or `Use SRT file`.

## License

MIT License. See [LICENSE](./LICENSE).
