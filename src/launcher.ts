import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const cliPath = path.join(packageDir, "cli.js")
const forwardedArgs = process.argv.slice(2)

function run(command: string, args: string[]) {
  return spawnSync(command, args, { stdio: "inherit" })
}

function finish(result: ReturnType<typeof spawnSync>) {
  if (result.error?.code === "ENOENT") return false
  process.exit(result.status === null ? 1 : result.status)
}

const bunResult = run("bun", [cliPath, ...forwardedArgs])
if (finish(bunResult)) {
  // process exited in finish()
}

const major = Number(process.versions.node.split(".")[0] ?? 0)
if (major >= 26) {
  // Only --experimental-ffi is required. --allow-ffi implies --permission and breaks CLI startup.
  const nodeResult = run(process.execPath, ["--experimental-ffi", cliPath, ...forwardedArgs])
  if (finish(nodeResult)) {
    // process exited in finish()
  }
}

console.error(
  [
    "@skxv/transcribe requires Bun or Node.js 26+.",
    "",
    `Detected Node.js ${process.versions.node} without Bun on PATH.`,
    "",
    "Install Bun:  curl -fsSL https://bun.sh/install | bash",
    "Or upgrade Node: https://nodejs.org/ (26.1+ with --experimental-ffi)",
  ].join("\n"),
)
process.exit(1)
