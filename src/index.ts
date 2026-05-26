import { mkdir, stat, writeFile } from "node:fs/promises"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import path from "node:path"
import { AssemblyAI } from "assemblyai"
import {
  BoxRenderable,
  CodeRenderable,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  SyntaxStyle,
  TextRenderable,
  createCliRenderer,
} from "@opentui/core"

const apiKey = process.env.ASSEMBLYAI_API_KEY

if (!apiKey) {
  console.error("Missing ASSEMBLYAI_API_KEY. Add it to .env.local or export it before running.")
  process.exit(1)
}

const audioExtensions = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".flac",
  ".m4a",
  ".mp3",
  ".mp4",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
  ".wma",
])

type Job = {
  filePath: string
  status: "queued" | "transcribing" | "done" | "error"
  message: string
  transcriptId?: string
  outputPath?: string
  text?: string
  utterances?: Utterance[]
}

type Utterance = {
  speaker?: string | null
  text?: string | null
  start?: number | null
  end?: number | null
}

const client = new AssemblyAI({ apiKey })
const jobs: Job[] = []
let activeJob: Job | undefined
let speakerNames = new Map<string, string>()
let selectedUtteranceIndex = 0
let editingUtteranceIndex: number | undefined
let lastTranscriptClick: { index: number; time: number } | undefined
const transcriptRowIds: string[] = []
const speakerColors = new Map<string, string>()
const speakerColorPalette = ["#8EA2FF", "#72D49F", "#FFD166", "#FF8FA3", "#C792EA", "#7FDBFF", "#F78C6C", "#A3E635"]
let modalMode: "speaker" | undefined
let modalUtteranceIndex = 0
let playerProcess: ChildProcessWithoutNullStreams | undefined
let playbackStartedAt = 0
let playbackPositionMs = 0
let playbackTimer: Timer | undefined
let playbackActiveIndex = -1
const settings = {
  speechModels: ["universal-3-pro", "universal-2"],
  languageDetection: true,
  speakerLabels: true,
  maxSpeakers: undefined as number | undefined,
}
const syntaxStyle = SyntaxStyle.fromStyles({
  default: { fg: "#DDE7F3" },
  list: { fg: "#C7D0DD" },
  punctuation: { fg: "#8B98AA" },
  string: { fg: "#72D49F" },
})

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  targetFps: 30,
})

process.once("exit", () => {
  if (playerProcess) playerProcess.kill()
})

const app = new BoxRenderable(renderer, {
  id: "app",
  width: "100%",
  height: "100%",
  flexDirection: "row",
  gap: 1,
  padding: 1,
  backgroundColor: "#101318",
})

const settingsPanel = new BoxRenderable(renderer, {
  id: "settings-panel",
  width: 42,
  flexShrink: 0,
  height: "100%",
  flexDirection: "column",
  gap: 0,
  padding: 1,
  border: true,
  borderStyle: "rounded",
  borderColor: "#303746",
  backgroundColor: "#151A21",
})

const mainPanel = new BoxRenderable(renderer, {
  id: "main-panel",
  flexGrow: 1,
  flexShrink: 1,
  minWidth: 40,
  height: "100%",
  flexDirection: "column",
  gap: 1,
  padding: 1,
  border: true,
  borderStyle: "rounded",
  borderColor: "#303746",
  backgroundColor: "#101318",
})

const historyPanel = new BoxRenderable(renderer, {
  id: "history-panel",
  width: 24,
  flexShrink: 0,
  height: "100%",
  flexDirection: "column",
  gap: 1,
  padding: 1,
  border: true,
  borderStyle: "rounded",
  borderColor: "#303746",
  backgroundColor: "#151A21",
})

const settingsTitle = new TextRenderable(renderer, {
  id: "settings-title",
  content: "Settings",
  fg: "#8EA2FF",
  attributes: 1,
})

const help = new TextRenderable(renderer, {
  id: "help",
  content: "Tab: next  Enter: select",
  fg: "#AAB6C5",
})

const fileLabel = new TextRenderable(renderer, {
  id: "file-label",
  content: "Audio file",
  fg: "#EAF0F7",
  attributes: 1,
})

const inputFrame = new BoxRenderable(renderer, {
  id: "input-frame",
  width: "100%",
  border: true,
  borderStyle: "rounded",
  borderColor: "#3C4656",
  padding: 0,
  backgroundColor: "#101318",
})

const input = new InputRenderable(renderer, {
  id: "file-input",
  width: "100%",
  placeholder: "Drop or paste audio file path(s) here",
  maxLength: 10000,
  backgroundColor: "#101318",
  focusedBackgroundColor: "#151A21",
  textColor: "#EAF0F7",
  focusedTextColor: "#FFFFFF",
})

const modelLabel = new TextRenderable(renderer, {
  id: "model-label",
  content: "Model",
  fg: "#EAF0F7",
  attributes: 1,
})

const modelSelect = new SelectRenderable(renderer, {
  id: "model-select",
  width: "100%",
  height: 2,
  options: [
    { name: "Universal 3 Pro", description: "Highest accuracy", value: ["universal-3-pro", "universal-2"] },
    { name: "Universal 2", description: "Broad fallback model", value: ["universal-2"] },
  ],
  showDescription: false,
  wrapSelection: true,
  backgroundColor: "#101318",
  focusedBackgroundColor: "#1C2533",
  textColor: "#C7D0DD",
  focusedTextColor: "#FFFFFF",
  selectedBackgroundColor: "#3A4B68",
  selectedTextColor: "#FFFFFF",
})

const languageLabel = new TextRenderable(renderer, {
  id: "language-label",
  content: "Language",
  fg: "#EAF0F7",
  attributes: 1,
})

const languageSelect = new SelectRenderable(renderer, {
  id: "language-select",
  width: "100%",
  height: 2,
  options: [
    { name: "Auto-detect", description: "Detect language", value: true },
    { name: "Disabled", description: "Use API default", value: false },
  ],
  showDescription: false,
  wrapSelection: true,
  backgroundColor: "#101318",
  focusedBackgroundColor: "#1C2533",
  textColor: "#C7D0DD",
  focusedTextColor: "#FFFFFF",
  selectedBackgroundColor: "#3A4B68",
  selectedTextColor: "#FFFFFF",
})

const speakerTitle = new TextRenderable(renderer, {
  id: "speaker-title",
  content: "Speaker Diarization",
  fg: "#8EA2FF",
  attributes: 1,
})

const diarizationSelect = new SelectRenderable(renderer, {
  id: "diarization-select",
  width: "100%",
  height: 2,
  options: [
    { name: "Speaker labels on", description: "Separate speakers", value: true },
    { name: "Speaker labels off", description: "Plain transcript", value: false },
  ],
  showDescription: false,
  wrapSelection: true,
  backgroundColor: "#101318",
  focusedBackgroundColor: "#1C2533",
  textColor: "#C7D0DD",
  focusedTextColor: "#FFFFFF",
  selectedBackgroundColor: "#3A4B68",
  selectedTextColor: "#FFFFFF",
})

const speakerCountLabel = new TextRenderable(renderer, {
  id: "speaker-count-label",
  content: "Speakers expected",
  fg: "#EAF0F7",
  attributes: 1,
})

const speakerCountSelect = new SelectRenderable(renderer, {
  id: "speaker-count-select",
  width: "100%",
  height: 4,
  options: [
    { name: "Auto", description: "Let AssemblyAI decide", value: undefined },
    { name: "2 speakers", description: "Use when known", value: 2 },
    { name: "3 speakers", description: "Use when known", value: 3 },
    { name: "4 speakers", description: "Use when known", value: 4 },
  ],
  showDescription: false,
  wrapSelection: true,
  backgroundColor: "#101318",
  focusedBackgroundColor: "#1C2533",
  textColor: "#C7D0DD",
  focusedTextColor: "#FFFFFF",
  selectedBackgroundColor: "#3A4B68",
  selectedTextColor: "#FFFFFF",
})

const playerTitle = new TextRenderable(renderer, {
  id: "player-title",
  content: "Player",
  fg: "#8EA2FF",
  attributes: 1,
  visible: false,
})

const playerFile = new TextRenderable(renderer, {
  id: "player-file",
  content: "",
  fg: "#EAF0F7",
  visible: false,
})

const playerStatus = new TextRenderable(renderer, {
  id: "player-status",
  content: "Stopped",
  fg: "#AAB6C5",
  visible: false,
})

const playerHelp = new TextRenderable(renderer, {
  id: "player-help",
  content: "Space: play/pause  X: stop",
  fg: "#AAB6C5",
  visible: false,
})

const status = new TextRenderable(renderer, {
  id: "status",
  content: "Ready.",
  fg: "#8EA2FF",
})

const transcriptTitle = new TextRenderable(renderer, {
  id: "transcript-title",
  content: "Transcribe your audio files",
  fg: "#EAF0F7",
  attributes: 1,
})

const emptyState = new TextRenderable(renderer, {
  id: "empty-state",
  content: "Transcript output appears here after you drop a file. Double-click a speaker to rename it. Double-click text to edit it.",
  fg: "#AAB6C5",
})

const transcriptControls = new TextRenderable(renderer, {
  id: "transcript-controls",
  content: "N/P: move  E: edit line  R: rename speaker",
  fg: "#AAB6C5",
})

const transcriptList = new BoxRenderable(renderer, {
  id: "transcript-list",
  width: "100%",
  flexGrow: 1,
  flexDirection: "column",
  gap: 0,
  backgroundColor: "#101318",
})

const historyTitle = new TextRenderable(renderer, {
  id: "history-title",
  content: "History (0)",
  fg: "#AAB6C5",
  attributes: 1,
})

const history = new CodeRenderable(renderer, {
  id: "history",
  width: "100%",
  flexGrow: 1,
  content: "No files yet.",
  filetype: "markdown",
  syntaxStyle,
  fg: "#C7D0DD",
  bg: "#151A21",
  wrapMode: "word",
})

inputFrame.add(input)
settingsPanel.add(settingsTitle)
settingsPanel.add(help)
settingsPanel.add(fileLabel)
settingsPanel.add(inputFrame)
settingsPanel.add(modelLabel)
settingsPanel.add(modelSelect)
settingsPanel.add(languageLabel)
settingsPanel.add(languageSelect)
settingsPanel.add(speakerTitle)
settingsPanel.add(diarizationSelect)
settingsPanel.add(speakerCountLabel)
settingsPanel.add(speakerCountSelect)
settingsPanel.add(playerTitle)
settingsPanel.add(playerFile)
settingsPanel.add(playerStatus)
settingsPanel.add(playerHelp)
mainPanel.add(status)
mainPanel.add(transcriptTitle)
mainPanel.add(emptyState)
mainPanel.add(transcriptControls)
mainPanel.add(transcriptList)
historyPanel.add(historyTitle)
historyPanel.add(history)
app.add(settingsPanel)
app.add(mainPanel)
app.add(historyPanel)

const modal = new BoxRenderable(renderer, {
  id: "modal",
  width: "50%",
  height: 7,
  position: "absolute",
  left: "25%",
  top: "35%",
  zIndex: 20,
  flexDirection: "column",
  gap: 1,
  padding: 1,
  border: true,
  borderStyle: "rounded",
  borderColor: "#8EA2FF",
  backgroundColor: "#151A21",
  visible: false,
})

const modalTitle = new TextRenderable(renderer, {
  id: "modal-title",
  content: "",
  fg: "#EAF0F7",
  attributes: 1,
})

const modalInput = new InputRenderable(renderer, {
  id: "modal-input",
  width: "100%",
  maxLength: 10000,
  backgroundColor: "#101318",
  focusedBackgroundColor: "#101318",
  textColor: "#EAF0F7",
  focusedTextColor: "#FFFFFF",
})

const modalHelp = new TextRenderable(renderer, {
  id: "modal-help",
  content: "Enter saves. Esc cancels.",
  fg: "#AAB6C5",
})

modal.add(modalTitle)
modal.add(modalInput)
modal.add(modalHelp)
renderer.root.add(app)
renderer.root.add(modal)
input.focus()

const focusables = [input, modelSelect, languageSelect, diarizationSelect, speakerCountSelect]
let focusedControlIndex = 0
const focusLabels = [fileLabel, modelLabel, languageLabel, speakerTitle, speakerCountLabel]
const settingsControls = [
  settingsTitle,
  help,
  fileLabel,
  inputFrame,
  modelLabel,
  modelSelect,
  languageLabel,
  languageSelect,
  speakerTitle,
  diarizationSelect,
  speakerCountLabel,
  speakerCountSelect,
]
const playerControls = [playerTitle, playerFile, playerStatus, playerHelp]

function focusSettingsControl(index: number) {
  focusedControlIndex = index
  focusables[focusedControlIndex]?.focus()
  renderSettingsFocus()
}

function renderSettingsFocus() {
  focusLabels.forEach((label, index) => {
    label.fg = index === focusedControlIndex ? "#FFD166" : index === 3 ? "#8EA2FF" : "#EAF0F7"
  })
}

renderSettingsFocus()

renderer.keyInput.on("keypress", (key) => {
  if (editingUtteranceIndex !== undefined) {
    if (key.name === "escape") {
      cancelInlineEdit()
    }
    return
  }

  if (modal.visible && key.name === "escape") {
    closeModal()
    return
  }

  if (!modal.visible && activeJob?.utterances?.length) {
    if (key.name === "space") {
      togglePlayback()
      return
    }
    if (key.name === "x") {
      stopPlayback()
      return
    }
    if (key.name === "n") {
      selectedUtteranceIndex = Math.min(selectedUtteranceIndex + 1, activeJob.utterances.length - 1)
      renderActiveTranscript()
      return
    }
    if (key.name === "p") {
      selectedUtteranceIndex = Math.max(selectedUtteranceIndex - 1, 0)
      renderActiveTranscript()
      return
    }
    if (key.name === "e") {
      startInlineEdit(selectedUtteranceIndex)
      return
    }
    if (key.name === "r") {
      openSpeakerModal(selectedUtteranceIndex)
      return
    }
  }

  if (key.name === "tab") {
    focusSettingsControl((focusedControlIndex + 1) % focusables.length)
    return
  }

  if (!key.ctrl) return
  if (key.name === "f") {
    focusSettingsControl(0)
    setStatus("File input focused.")
  }
  if (key.name === "s") {
    setStatus("Speaker names are edited from the transcript column.")
  }
})

modelSelect.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: { value?: string[] }) => {
  settings.speechModels = option.value ?? settings.speechModels
  setStatus(`Model set to ${modelSelect.getSelectedOption()?.name ?? "selected model"}.`)
})

languageSelect.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: { value?: boolean }) => {
  settings.languageDetection = option.value ?? true
  setStatus(settings.languageDetection ? "Language auto-detection enabled." : "Language auto-detection disabled.")
})

diarizationSelect.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: { value?: boolean }) => {
  settings.speakerLabels = option.value ?? true
  setStatus(settings.speakerLabels ? "Speaker diarization enabled." : "Speaker diarization disabled.")
})

speakerCountSelect.on(SelectRenderableEvents.ITEM_SELECTED, (_index: number, option: { value?: number }) => {
  settings.maxSpeakers = option.value
  setStatus(settings.maxSpeakers ? `Expecting ${settings.maxSpeakers} speakers.` : "Speaker count set to auto.")
})

input.on(InputRenderableEvents.ENTER, async (value: string) => {
  const paths = parseDroppedPaths(value)
  input.value = ""

  if (paths.length === 0) {
    setStatus("Paste or drop at least one audio file path.", "warn")
    return
  }

  const accepted: string[] = []
  for (const droppedPath of paths) {
    const resolved = path.resolve(droppedPath)
    const validation = await validateAudioFile(resolved)
    if (validation) {
      addJob({
        filePath: resolved,
        status: "error",
        message: validation,
      })
    } else {
      accepted.push(resolved)
      addJob({
        filePath: resolved,
        status: "queued",
        message: "Waiting to start",
      })
    }
  }

  for (const filePath of accepted) {
    void transcribeFile(filePath)
  }
})

modalInput.on(InputRenderableEvents.ENTER, async (value: string) => {
  await saveModalValue(value)
})

function addJob(job: Job) {
  jobs.push(job)
  renderJobs()
}

function setStatus(message: string, tone: "ok" | "warn" | "error" = "ok") {
  status.content = message
  status.fg = tone === "ok" ? "#72D49F" : tone === "warn" ? "#FFD166" : "#FF7B7B"
}

function renderJobs() {
  const completedCount = jobs.filter((job) => job.status === "done").length
  historyTitle.content = `History (${jobs.length})`
  history.content =
    jobs
      .map((job) => {
        const marker = job.status === "done" ? "OK" : job.status === "error" ? "ERR" : job.status.toUpperCase()
        const name = path.basename(job.filePath)
        const destination = job.outputPath ? ` -> ${path.relative(process.cwd(), job.outputPath)}` : ""
        return `- [${marker}] ${name}: ${job.message}${destination}`
      })
      .join("\n") || "No files yet."
  if (completedCount === 0 && jobs.length === 0) {
    historyTitle.content = "History (0)"
  }
}

function updateJob(filePath: string, patch: Partial<Job>) {
  const job = jobs.find((item) => item.filePath === filePath && item.status !== "done" && item.status !== "error")
  if (!job) return
  Object.assign(job, patch)
  renderJobs()
}

async function transcribeFile(filePath: string) {
  updateJob(filePath, {
    status: "transcribing",
    message: "Uploading and transcribing with Universal-3 Pro",
  })
  setStatus(`Transcribing ${path.basename(filePath)}...`)

  try {
    const result = await client.transcripts.transcribe(
      {
        audio: filePath,
        speech_models: settings.speechModels,
        language_detection: settings.languageDetection,
        speaker_labels: settings.speakerLabels,
        speakers_expected: settings.maxSpeakers,
      },
      { pollingInterval: 3000 },
    )

    if (result.status === "error") {
      throw new Error(result.error || "AssemblyAI returned an error status.")
    }

    const completedJob = jobs.find((item) => item.filePath === filePath && item.status === "transcribing")
    if (completedJob) {
      completedJob.text = result.text || ""
      completedJob.utterances = result.utterances ?? undefined
      activeJob = completedJob
    }

    const outputPath = await writeTranscript(filePath, formatTranscript(result.text || "", result.utterances ?? undefined))
    updateJob(filePath, {
      status: "done",
      message: `Transcript ${result.id}`,
      transcriptId: result.id,
      outputPath,
    })
    renderActiveTranscript()
    showPlayer()
    setStatus(`Completed ${path.basename(filePath)}.`)
  } catch (error) {
    updateJob(filePath, {
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    })
    setStatus(`Failed ${path.basename(filePath)}.`, "error")
  }
}

async function validateAudioFile(filePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(filePath)
    if (!fileStat.isFile()) return "Not a file"
  } catch {
    return "File does not exist"
  }

  const extension = path.extname(filePath).toLowerCase()
  if (!audioExtensions.has(extension)) {
    return `Unsupported extension ${extension || "(none)"}`
  }

  return null
}

async function writeTranscript(filePath: string, text: string) {
  const transcriptsDir = path.join(process.cwd(), "transcripts")
  await mkdir(transcriptsDir, { recursive: true })

  const baseName = path.basename(filePath, path.extname(filePath))
  const outputPath = path.join(transcriptsDir, `${baseName}.txt`)
  await writeFile(outputPath, text.trim() + "\n", "utf8")
  return outputPath
}

function renderActiveTranscript() {
  for (const rowId of transcriptRowIds.splice(0)) {
    transcriptList.remove(rowId)
  }

  emptyState.content = activeJob ? "" : "Transcript output appears here after you drop a file. Double-click a speaker to rename it. Double-click text to edit it."

  if (!activeJob?.utterances?.length) {
    if (activeJob?.text) {
      const row = createTranscriptRow(0, undefined, activeJob.text)
      transcriptList.add(row)
    }
    return
  }

  selectedUtteranceIndex = Math.min(selectedUtteranceIndex, activeJob.utterances.length - 1)
  activeJob.utterances.forEach((utterance, index) => {
    const row = createTranscriptRow(index, utterance.speaker, utterance.text ?? "")
    transcriptList.add(row)
  })
}

function showPlayer() {
  for (const control of settingsControls) control.visible = false
  for (const control of playerControls) control.visible = true
  playerFile.content = activeJob ? path.basename(activeJob.filePath) : ""
  updatePlayerStatus()
}

function updatePlayerStatus() {
  const duration = getAudioDurationMs()
  const position = formatDuration(playbackPositionMs)
  const total = duration ? formatDuration(duration) : "--:--"
  playerStatus.content = `${playerProcess ? "Playing" : "Stopped"}  ${position} / ${total}`
}

function togglePlayback() {
  if (!activeJob) return
  if (playerProcess) {
    stopPlayback()
    return
  }
  startPlayback()
}

function startPlayback() {
  if (!activeJob) return
  stopPlayback(false)

  playbackPositionMs = 0
  playbackStartedAt = Date.now()
  playerProcess = spawn("afplay", [activeJob.filePath])
  playerProcess.once("exit", () => {
    playerProcess = undefined
    playbackPositionMs = 0
    playbackActiveIndex = -1
    clearPlaybackTimer()
    updatePlayerStatus()
    renderActiveTranscript()
  })

  playbackTimer = setInterval(() => {
    playbackPositionMs = Date.now() - playbackStartedAt
    const nextIndex = getUtteranceIndexAt(playbackPositionMs)
    if (nextIndex !== playbackActiveIndex) {
      playbackActiveIndex = nextIndex
      if (nextIndex >= 0) selectedUtteranceIndex = nextIndex
      renderActiveTranscript()
    }
    updatePlayerStatus()
  }, 250)
  updatePlayerStatus()
}

function stopPlayback(reset = true) {
  if (playerProcess) {
    playerProcess.kill()
    playerProcess = undefined
  }
  clearPlaybackTimer()
  if (reset) {
    playbackPositionMs = 0
    playbackActiveIndex = -1
  }
  updatePlayerStatus()
  renderActiveTranscript()
}

function clearPlaybackTimer() {
  if (!playbackTimer) return
  clearInterval(playbackTimer)
  playbackTimer = undefined
}

function getUtteranceIndexAt(positionMs: number) {
  return activeJob?.utterances?.findIndex((utterance) => {
    const start = utterance.start ?? 0
    const end = utterance.end ?? start
    return positionMs >= start && positionMs <= end
  }) ?? -1
}

function getAudioDurationMs() {
  return activeJob?.utterances?.reduce((max, utterance) => Math.max(max, utterance.end ?? 0), 0) ?? 0
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
  const seconds = (totalSeconds % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

function getActiveTranscriptText() {
  if (!activeJob) return ""
  return formatTranscript(activeJob.text || "", activeJob.utterances)
}

function getActiveSpeakers() {
  return [
    ...new Set(
      activeJob?.utterances
        ?.map((utterance) => utterance.speaker)
        .filter((speaker): speaker is string => Boolean(speaker)) ?? [],
    ),
  ].sort()
}

function formatTranscript(text: string, utterances?: Utterance[]) {
  if (utterances?.length) {
    return utterances
      .map((utterance) => `${formatSpeaker(utterance.speaker)}: ${utterance.text ?? ""}`)
      .join("\n\n")
  }

  return text || "No transcript text returned."
}

function formatSpeaker(speaker?: string | null) {
  if (!speaker) return "Speaker ?"
  return speakerNames.get(speaker) || `Speaker ${speaker}`
}

function createTranscriptRow(index: number, speaker: string | null | undefined, text: string) {
  const speakerLabel = formatSpeaker(speaker)
  const selected = index === selectedUtteranceIndex
  const active = index === playbackActiveIndex
  const rowId = `transcript-row-${index}`
  const content = `${selected ? "> " : "  "}${speakerLabel}: ${text}`
  const rowHeight = getWrappedLineCount(content, getTranscriptContentWidth())
  transcriptRowIds.push(rowId)

  if (editingUtteranceIndex === index) {
    const row = new BoxRenderable(renderer, {
      id: rowId,
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: "#1A1F29",
    })
    const prefix = new TextRenderable(renderer, {
      id: `${rowId}-prefix`,
      width: speakerLabel.length + 4,
      content: `${selected ? "> " : "  "}${speakerLabel}: `,
      fg: speaker ? getSpeakerColor(speaker) : "#DDE7F3",
      bg: "#1A1F29",
      selectable: false,
    })
    const editor = new InputRenderable(renderer, {
      id: `${rowId}-editor`,
      width: "100%",
      value: text,
      maxLength: 20000,
      backgroundColor: "#1A1F29",
      focusedBackgroundColor: "#1A1F29",
      textColor: "#EAF0F7",
      focusedTextColor: "#FFFFFF",
    })
    editor.on(InputRenderableEvents.ENTER, async (value: string) => {
      await saveInlineEdit(index, value)
    })
    row.add(prefix)
    row.add(editor)
    setTimeout(() => editor.focus(), 0)
    return row
  }

  return new TextRenderable(renderer, {
    id: rowId,
    width: "100%",
    height: rowHeight,
    content,
    fg: speaker ? getSpeakerColor(speaker) : "#DDE7F3",
    bg: active ? "#26324A" : selected ? "#1A1F29" : "#101318",
    selectable: false,
    selectionBg: undefined,
    selectionFg: undefined,
    wrapMode: "word",
    truncate: false,
    onMouseDown: (event: { x: number; button: number }) => {
      if (event.button !== 0) return
      const now = Date.now()
      const localX = event.x - transcriptList.screenX
      const isDoubleClick = lastTranscriptClick?.index === index && now - lastTranscriptClick.time < 450
      selectedUtteranceIndex = index
      renderActiveTranscript()
      if (isDoubleClick) {
        if (speaker && localX <= speakerLabel.length + 4) {
          openSpeakerModal(index)
        } else {
          startInlineEdit(index)
        }
      }
      lastTranscriptClick = { index, time: now }
    },
  })
}

function getTranscriptContentWidth() {
  const terminalWidth = process.stdout.columns || 120
  const appPadding = 2
  const columnGaps = 2
  const sidebars = 42 + 24
  const mainPanelChrome = 4
  return Math.max(32, terminalWidth - appPadding - columnGaps - sidebars - mainPanelChrome)
}

function getWrappedLineCount(content: string, width: number) {
  if (width <= 0) return 1

  let lines = 1
  let column = 0
  for (const word of content.split(/(\s+)/)) {
    if (!word) continue

    if (/^\s+$/.test(word)) {
      if (column < width) column += 1
      continue
    }

    if (word.length > width) {
      if (column > 0) {
        lines += 1
        column = 0
      }
      lines += Math.floor((word.length - 1) / width)
      column = word.length % width
      if (column === 0) column = width
      continue
    }

    if (column > 0 && column + word.length > width) {
      lines += 1
      column = word.length
    } else {
      column += word.length
    }
  }

  return lines
}

function getSpeakerColor(speaker: string) {
  const colorKey = formatSpeaker(speaker).trim().toLowerCase()
  const existing = speakerColors.get(colorKey)
  if (existing) return existing

  const used = new Set(speakerColors.values())
  const available = speakerColorPalette.filter((color) => !used.has(color))
  const color = available[Math.floor(Math.random() * available.length)] ?? speakerColorPalette[Math.floor(Math.random() * speakerColorPalette.length)]
  speakerColors.set(colorKey, color)
  return color
}

function openSpeakerModal(index: number) {
  const utterance = activeJob?.utterances?.[index]
  if (!utterance?.speaker) return
  modalMode = "speaker"
  modalUtteranceIndex = index
  modalTitle.content = `Rename ${formatSpeaker(utterance.speaker)}`
  modalInput.value = speakerNames.get(utterance.speaker) || `Speaker ${utterance.speaker}`
  modal.visible = true
  modalInput.focus()
}

function startInlineEdit(index: number) {
  const utterance = activeJob?.utterances?.[index]
  if (!utterance) return
  editingUtteranceIndex = index
  selectedUtteranceIndex = index
  setStatus("Editing transcript line. Enter saves. Esc cancels.")
  renderActiveTranscript()
}

async function saveInlineEdit(index: number, value: string) {
  const utterance = activeJob?.utterances?.[index]
  if (!utterance) return
  utterance.text = value
  activeJob!.text = activeJob!.utterances?.map((item) => item.text ?? "").join(" ") ?? activeJob!.text
  editingUtteranceIndex = undefined
  setStatus("Transcript line updated.")
  renderActiveTranscript()
  await writeActiveTranscript()
}

function cancelInlineEdit() {
  editingUtteranceIndex = undefined
  setStatus("Edit cancelled.")
  renderActiveTranscript()
}

async function saveModalValue(value: string) {
  const utterance = activeJob?.utterances?.[modalUtteranceIndex]
  if (!utterance) return

  if (modalMode === "speaker" && utterance.speaker) {
    speakerNames.set(utterance.speaker, value.trim() || `Speaker ${utterance.speaker}`)
    setStatus("Speaker renamed.")
  }

  closeModal()
  renderActiveTranscript()
  await writeActiveTranscript()
}

function closeModal() {
  modal.visible = false
  modalMode = undefined
  input.focus()
}

async function writeActiveTranscript() {
  if (!activeJob?.outputPath) return
  await writeFile(activeJob.outputPath, getActiveTranscriptText().trim() + "\n", "utf8")
}

function parseDroppedPaths(value: string) {
  return tokenizeDroppedValue(value)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => stripWrappingQuotes(token))
    .map((token) => decodeFileUri(token))
}

function tokenizeDroppedValue(value: string) {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaping = false

  for (const char of value.trim()) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === "\\") {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ""
      }
      continue
    }

    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function stripWrappingQuotes(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

function decodeFileUri(value: string) {
  if (!value.startsWith("file://")) return value
  const url = new URL(value)
  return decodeURIComponent(url.pathname)
}
