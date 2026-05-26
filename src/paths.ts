import os from "node:os"
import path from "node:path"

export function getAppConfigDir() {
  const home = os.homedir()
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming")
    return path.join(appData, "@skxv", "transcribe")
  }
  const configHome = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
  return path.join(configHome, "@skxv", "transcribe")
}

export function getTranscriptionsDir() {
  const home = os.homedir()
  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE || home
    return path.join(userProfile, "Documents", "Transcriptions")
  }
  return path.join(home, "Documents", "Transcriptions")
}

export function formatDisplayPath(filePath: string) {
  const home = os.homedir()
  if (filePath.startsWith(home)) {
    return `~${filePath.slice(home.length)}`
  }
  return filePath
}
