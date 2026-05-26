import { spawn, spawnSync, type ChildProcess } from "node:child_process"

export type AudioBackend = "ffplay" | "afplay" | "none"

let cachedBackend: AudioBackend | undefined

export function getAudioBackend(): AudioBackend {
  if (cachedBackend) return cachedBackend

  const hasFfplay = spawnSync("which", ["ffplay"], { stdio: "ignore" }).status === 0
  if (hasFfplay) {
    cachedBackend = "ffplay"
    return cachedBackend
  }

  if (process.platform === "darwin") {
    cachedBackend = "afplay"
    return cachedBackend
  }

  cachedBackend = "none"
  return cachedBackend
}

export function canSeek(backend: AudioBackend) {
  return backend === "ffplay"
}

export function spawnPlayback(filePath: string, startMs: number, backend: AudioBackend): ChildProcess | null {
  if (backend === "none") return null

  if (backend === "ffplay") {
    const startSec = (startMs / 1000).toFixed(3)
    return spawn(
      "ffplay",
      ["-nodisp", "-autoexit", "-loglevel", "quiet", "-ss", startSec, "-i", filePath],
      { stdio: "ignore" },
    )
  }

  if (startMs > 0) return null

  return spawn("afplay", [filePath], { stdio: "ignore" })
}
