export type Utterance = {
  speaker?: string | null
  text?: string | null
  start?: number | null
  end?: number | null
}

export type JobStatus = "queued" | "transcribing" | "done" | "error"

export type Job = {
  id: string
  filePath: string
  status: JobStatus
  message: string
  transcriptId?: string
  outputPath?: string
  text?: string
  utterances?: Utterance[]
  createdAt: string
}

export type HistoryEntry = {
  id: string
  filePath: string
  outputPath?: string
  transcriptId?: string
  status: "done" | "error"
  message: string
  createdAt: string
}

export type HistoryFile = {
  version: 1
  entries: HistoryEntry[]
}
