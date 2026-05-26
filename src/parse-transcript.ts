import type { Utterance } from "./types.js"

export function parseTranscriptFile(content: string): { text: string; utterances?: Utterance[] } {
  const trimmed = content.trim()
  if (!trimmed) {
    return { text: "" }
  }

  const blocks = trimmed.split(/\n\n+/)
  const utterances: Utterance[] = []

  for (const block of blocks) {
    const lines = block.split("\n")
    const firstLine = lines[0] ?? ""
    const match = firstLine.match(/^(.+?):\s*(.*)$/)
    if (!match) {
      return { text: trimmed }
    }

    const label = match[1]?.trim() ?? ""
    const firstText = match[2] ?? ""
    const rest = lines.slice(1)
    const text = [firstText, ...rest].join("\n").trim()
    const speaker = label.replace(/^Speaker\s+/i, "").trim() || label
    utterances.push({ speaker, text })
  }

  if (utterances.length === 0) {
    return { text: trimmed }
  }

  return {
    text: utterances.map((u) => u.text ?? "").join(" "),
    utterances,
  }
}
