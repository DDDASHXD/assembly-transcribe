import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { getAppConfigDir } from "./paths.js"
import type { HistoryEntry, HistoryFile } from "./types.js"

function getHistoryPath() {
  return path.join(getAppConfigDir(), "history.json")
}

export async function loadHistoryEntries(): Promise<HistoryEntry[]> {
  try {
    const raw = await readFile(getHistoryPath(), "utf8")
    const parsed = JSON.parse(raw) as HistoryFile
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return []
    return parsed.entries
  } catch {
    return []
  }
}

export async function saveHistoryEntries(entries: HistoryEntry[]) {
  const configDir = getAppConfigDir()
  await mkdir(configDir, { recursive: true })
  const payload: HistoryFile = { version: 1, entries }
  await writeFile(getHistoryPath(), JSON.stringify(payload, null, 2) + "\n", "utf8")
}

export async function appendHistoryEntry(entry: HistoryEntry) {
  const entries = await loadHistoryEntries()
  const existingIndex = entries.findIndex((item) => item.id === entry.id)
  if (existingIndex >= 0) {
    entries[existingIndex] = entry
  } else {
    entries.unshift(entry)
  }
  await saveHistoryEntries(entries)
}

export function historyEntryFromJob(job: {
  id: string
  filePath: string
  outputPath?: string
  transcriptId?: string
  status: "done" | "error"
  message: string
  createdAt: string
}): HistoryEntry {
  return {
    id: job.id,
    filePath: job.filePath,
    outputPath: job.outputPath,
    transcriptId: job.transcriptId,
    status: job.status,
    message: job.message,
    createdAt: job.createdAt,
  }
}
