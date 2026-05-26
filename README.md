# @skxv/transcribe

A terminal UI for transcribing local audio files with AssemblyAI.

## Install and run

```sh
npx @skxv/transcribe
```

For local development:

```sh
bun install
bun run dev
```

## First run

On first launch, the app prompts for your AssemblyAI API key in the terminal. The key is saved to your user config directory (`~/.config/@skxv/transcribe/config.json` on macOS/Linux). The app does not read `.env` files or environment variables for the API key.

## Use

Start the TUI, drag one or more audio files into the terminal input, then press Enter. Most terminals paste dragged files as paths, which the app validates and sends to AssemblyAI.

Completed transcripts are saved to `~/Documents/Transcriptions/<audio-file-name>.txt`. Select a past transcript in the History panel (or press `H` to focus it, then Enter) to open it again.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Tab | Next settings control |
| H | Focus history |
| Enter (history focused) | Open selected transcript |
| O / Ctrl+O | Reveal transcript in Finder / Explorer |
| N / P | Next / previous utterance |
| E | Edit utterance line |
| R | Rename speaker |
| Space / X | Play/pause / stop audio (macOS) |

## Transcription mode

Dropped files are transcribed with AssemblyAI's pre-recorded audio API using `universal-3-pro` with `universal-2` fallback.

## Publish

```sh
npm run build
npm publish --access public
```
