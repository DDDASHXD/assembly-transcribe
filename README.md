# Assembly Transcribe

A small OpenTUI CLI for transcribing local audio files with AssemblyAI.

## Run

```sh
bun install
bun run dev
```

The AssemblyAI key is loaded from `.env.local`. Keep that file out of git.

## Use

Start the TUI, drag one or more audio files into the terminal input, then press Enter. Most terminals paste dragged files as paths, which the app validates and sends to AssemblyAI.

Completed transcripts are written to `transcripts/<audio-file-name>.txt`, and the latest transcript is shown in the TUI.

## Transcription Mode

Dropped files are transcribed with AssemblyAI's pre-recorded audio API using `universal-3-pro` with `universal-2` fallback. AssemblyAI's real-time/streaming models are designed for live PCM audio streams, not already-recorded files dropped into a terminal.
