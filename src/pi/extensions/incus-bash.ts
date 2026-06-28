import { spawn } from "node:child_process";
import { relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type BashOperations, createBashTool } from "@earendil-works/pi-coding-agent";

function createIncusBashOperations(): BashOperations {
  const instance = requiredEnv("SHELLOCK_INCUS_INSTANCE");
  const hostWorkspace = resolve(process.env.SHELLOCK_WORKSPACE_HOST ?? process.cwd());
  const guestWorkspace = process.env.SHELLOCK_WORKSPACE_GUEST ?? "/workspace";
  const incusBinary = process.env.SHELLOCK_INCUS_BINARY ?? "incus";

  return {
    async exec(command, cwd, { onData, signal, timeout, env }) {
      const guestCwd = mapCwdToGuest(cwd, hostWorkspace, guestWorkspace);
      const args = ["exec", instance, "--cwd", guestCwd, "--", "bash", "-lc", command];

      return new Promise((resolvePromise, reject) => {
        const child = spawn(incusBinary, args, {
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        });

        let timedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeout * 1000);
        }

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);

        const onAbort = () => child.kill("SIGKILL");
        signal?.addEventListener("abort", onAbort, { once: true });

        child.on("error", (error) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);
          reject(error);
        });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          signal?.removeEventListener("abort", onAbort);

          if (signal?.aborted) {
            reject(new Error("aborted"));
          } else if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
          } else {
            resolvePromise({ exitCode: code });
          }
        });
      });
    },
  };
}

export default function incusBashExtension(pi: ExtensionAPI) {
  const localCwd = process.cwd();
  const localBash = createBashTool(localCwd);

  pi.registerTool({
    ...localBash,
    label: "bash (Shellock runtime)",
    async execute(id, params, signal, onUpdate) {
      if (!process.env.SHELLOCK_INCUS_INSTANCE) {
        return localBash.execute(id, params, signal, onUpdate);
      }

      const incusBash = createBashTool(localCwd, {
        operations: createIncusBashOperations(),
      });
      return incusBash.execute(id, params, signal, onUpdate);
    },
  });

  pi.on("user_bash", () => {
    if (!process.env.SHELLOCK_INCUS_INSTANCE) return;
    return { operations: createIncusBashOperations() };
  });

  pi.on("session_start", async (_event, ctx) => {
    const instance = process.env.SHELLOCK_INCUS_INSTANCE;
    if (instance) {
      ctx.ui.setStatus("runtime", ctx.ui.theme.fg("accent", `Incus: ${instance}`));
      ctx.ui.notify("Bash commands will execute inside the Shellock runtime.", "info");
      return;
    }

    ctx.ui.setStatus("runtime", ctx.ui.theme.fg("muted", "local bash"));
  });
}

function mapCwdToGuest(cwd: string, hostWorkspace: string, guestWorkspace: string): string {
  const absoluteCwd = resolve(cwd);
  const rel = relative(hostWorkspace, absoluteCwd);
  if (rel === "") return guestWorkspace;
  if (rel.startsWith("..")) return guestWorkspace;
  return `${guestWorkspace}/${rel}`;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the Incus bash extension`);
  return value;
}
