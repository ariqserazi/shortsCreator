# Bundled FFmpeg Tools

shortsCreator packages FFmpeg and FFprobe binaries here so end users do not need to install FFmpeg separately for the supported release targets.

Included targets:

- `darwin-arm64`
- `win32-x64`

The bundled FFmpeg builds include subtitle/text overlay support needed for the required top title label and burned SRT captions.

Sources:

- FFmpeg binaries are from the `@ffmpeg-installer/*` package family.
- FFprobe binaries are from `ffprobe-static`.

These binaries are redistributed with their upstream licenses. Production releases should review FFmpeg licensing requirements before distribution.
