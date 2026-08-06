import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npmCommand, ["run", "dev"], { stdio: "inherit", windowsHide: true, shell: process.platform === "win32" }),
  spawn(process.execPath, ["scripts/usage-bridge.mjs"], { stdio: "inherit", windowsHide: true }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill();
  setTimeout(() => process.exit(code), 500);
}

for (const child of children) {
  child.on("error", () => shutdown(1));
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) shutdown(code);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
