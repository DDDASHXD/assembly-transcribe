import { spawn } from "node:child_process"
import path from "node:path"

export async function revealInFileManager(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath)

  if (process.platform === "darwin") {
    await runCommand("open", ["-R", resolved])
    return
  }

  if (process.platform === "win32") {
    await runCommand("explorer", [`/select,${resolved}`])
    return
  }

  await runCommand("xdg-open", [path.dirname(resolved)])
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`))
    })
  })
}
