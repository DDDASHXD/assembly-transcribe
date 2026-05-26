import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { getAppConfigDir } from "./paths.js"

type ConfigFile = {
  apiKey: string
}

function getConfigPath() {
  return path.join(getAppConfigDir(), "config.json")
}

export async function loadApiKey(): Promise<string | undefined> {
  try {
    const raw = await readFile(getConfigPath(), "utf8")
    const parsed = JSON.parse(raw) as ConfigFile
    return parsed.apiKey?.trim() || undefined
  } catch {
    return undefined
  }
}

export async function saveApiKey(apiKey: string) {
  const configDir = getAppConfigDir()
  await mkdir(configDir, { recursive: true })
  const configPath = getConfigPath()
  await writeFile(configPath, JSON.stringify({ apiKey: apiKey.trim() }, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  })
  if (process.platform !== "win32") {
    await chmod(configPath, 0o600).catch(() => undefined)
  }
}
