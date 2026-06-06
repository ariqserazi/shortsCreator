# shortsCreator

shortsCreator is a cross-platform desktop app for generating silent H.264 b-roll clips from local video files. Choose an input folder, choose an output folder, set the clip settings, and the app writes numbered `.mp4` clips such as `broll_0001.mp4`, `broll_0002.mp4`, and so on.

The app never modifies source videos. It only writes generated clips to the selected output folder.

## What It Does

- scans the top level of an input folder for supported video files
- supports `.mp4`, `.mkv`, `.mov`, `.avi`, and `.m4v`
- generates silent H.264 `.mp4` clips with `ffmpeg`
- reads source durations with `ffprobe`
- supports clip count, clip length, skip first seconds, and skip last seconds
- supports randomized start times or sequential start times
- logs progress and per-clip failures in the desktop UI
- runs as a normal macOS or Windows desktop application

## End User Install

### macOS

1. Open the GitHub Releases page for this project.
2. Download `shortsCreator-x.x.x.dmg`.
3. Open the DMG.
4. Drag `shortsCreator` into Applications.
5. Open `shortsCreator` from Applications.

### Windows

1. Open the GitHub Releases page for this project.
2. Download `shortsCreator-Setup-x.x.x.exe`.
3. Double-click the installer.
4. Follow the installer prompts.
5. Open `shortsCreator` from the Start Menu or Desktop shortcut.

End users do not need to clone the repository, install Node.js, run npm commands, open localhost, or use any other video editing app.

## FFmpeg Requirement

shortsCreator needs both `ffmpeg` and `ffprobe`.

Detection order:

1. saved custom `ffmpeg` and `ffprobe` paths
2. tools available on `PATH`
3. common macOS paths:
   - `/opt/homebrew/bin/ffmpeg`
   - `/opt/homebrew/bin/ffprobe`
   - `/usr/local/bin/ffmpeg`
   - `/usr/local/bin/ffprobe`
4. common Windows paths:
   - `C:\ffmpeg\bin\ffmpeg.exe`
   - `C:\ffmpeg\bin\ffprobe.exe`
   - `C:\Program Files\ffmpeg\bin\ffmpeg.exe`
   - `C:\Program Files\ffmpeg\bin\ffprobe.exe`

If automatic detection fails, use the `Choose ffmpeg` and `Choose ffprobe` buttons in the app. shortsCreator saves those paths between launches.

### Install FFmpeg On macOS

With Homebrew:

```bash
brew install ffmpeg
```

### Install FFmpeg On Windows

Use one of these options:

```powershell
winget install Gyan.FFmpeg
```

or download a Windows build from [ffmpeg.org](https://ffmpeg.org/download.html), then choose `ffmpeg.exe` and `ffprobe.exe` manually in shortsCreator.

## How To Use

1. Open shortsCreator.
2. Choose an input folder containing local video files.
3. Choose an output folder for generated clips.
4. Set clip count, clip length, skip first seconds, skip last seconds, and randomization.
5. Click `Check FFmpeg` if you want to confirm tool detection.
6. Click `Generate Clips`.
7. Watch progress, generated files, and logs in the app.
8. Click `Open Output Folder` to view the generated `.mp4` clips.

Sequential mode runs through each source video in clip-length steps before moving to the next source file. Randomized mode chooses valid start times from usable source videos.

Existing files named like `broll_0001.mp4` may be overwritten when a new run writes the same numbered output. shortsCreator logs a warning before overwriting. It does not delete old files.

## Development

Requirements:

- Node.js for development
- npm
- `ffmpeg` and `ffprobe` for clip generation testing

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run dev
```

This launches Electron directly. The packaged app is still a normal desktop application; there is no browser-only localhost workflow.

Validate the project structure and JavaScript syntax:

```bash
npm run validate
```

## Build Commands

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

Expected release artifacts:

- `shortsCreator-1.0.0.dmg`
- `shortsCreator-Setup-1.0.0.exe`

macOS installers are best built on macOS. Windows installers are best built on Windows or in CI. Unsigned development builds are supported, but one machine may not perfectly build and sign every target.

## GitHub Releases

Recommended release flow:

1. Run `npm install`.
2. On macOS, run `npm run build:mac` to create the DMG.
3. On Windows or Windows CI, run `npm run build:win` to create the EXE installer.
4. Upload the generated files from `dist/` to a GitHub Release.
5. Users download the correct installer for their computer.

## Security Warnings

Unsigned builds may show operating system warnings:

- Windows may show Microsoft SmartScreen warnings.
- macOS may show Gatekeeper warnings.

Production releases should eventually be code signed:

- macOS with an Apple Developer ID certificate and notarization.
- Windows with a trusted code signing certificate.

## Troubleshooting

### FFmpeg Is Not Detected

- Click `Check FFmpeg` and read the message in the log.
- Install FFmpeg with Homebrew, winget, Chocolatey, or a downloaded build.
- Use `Choose ffmpeg` and `Choose ffprobe` to select the binaries manually.
- Confirm both tools are from the same FFmpeg install.

### No Clips Were Generated

- Confirm the input folder contains supported video files at the top level.
- Check that skip first seconds and skip last seconds leave enough usable duration.
- Reduce clip length or clip count for short source videos.
- Read the live log for skipped files or per-clip failures.

### Output Files Already Exist

shortsCreator uses stable numbered names. If `broll_0001.mp4` already exists, a new run can overwrite it and will log a warning first. Move old clips to another folder if you want to keep every previous run.

## License

MIT License. See [LICENSE](./LICENSE).
