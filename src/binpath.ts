import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, dirname, isAbsolute, join } from "node:path";

/**
 * Where CLIs live when the process was not started from a login shell.
 *
 * A GUI-launched host (Claude Desktop from the Dock, a launchd agent) hands its
 * children a bare PATH of /usr/bin:/bin:/usr/sbin:/sbin. Nothing installed by
 * Homebrew, nvm, or `pip --user` is on it, so `spawn("gws")` fails with ENOENT and
 * the server looks broken for reasons that have nothing to do with credentials.
 * The same host launched from a terminal works fine, which makes it worse: the
 * failure depends on how the app happened to be opened.
 */
function standardDirs(): string[] {
  const home = homedir();
  const dirs =
    platform() === "win32"
      ? []
      : [
          "/opt/homebrew/bin",
          "/opt/homebrew/sbin",
          "/usr/local/bin",
          join(home, ".local", "bin"),
          join(home, "bin"),
          "/usr/bin",
          "/bin",
        ];
  // The directory holding our own node also holds the tools installed beside it
  // (nvm, volta, asdf shims), which is where a globally linked CLI often sits.
  dirs.push(dirname(process.execPath));
  return dirs;
}

/** PATH for child processes: the inherited one first, then the standard dirs. */
export function augmentPath(env: NodeJS.ProcessEnv = process.env): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const dir of [...(env.PATH?.split(delimiter) ?? []), ...standardDirs()]) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    parts.push(dir);
  }
  return parts.join(delimiter);
}

/**
 * Absolute path for a CLI, or null when it genuinely is not installed.
 *
 * Returning null rather than the bare name matters: `spawn` on a bare name fails
 * later with a cryptic ENOENT, whereas a null here lets the caller say which
 * binary is missing and where it looked.
 */
export function resolveBin(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (isAbsolute(name)) return existsSync(name) ? name : null;
  if (name.includes("/")) return existsSync(name) ? name : null;
  for (const dir of augmentPath(env).split(delimiter)) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function missingBinMessage(name: string, envVar?: string): string {
  return (
    `\`${name}\` was not found on PATH or in the usual install locations. ` +
    `A host launched from the Dock rather than a terminal gets a minimal PATH, which is the ` +
    `usual cause. Fix it by adding a full PATH to this server's \`env\` in the host config` +
    (envVar ? `, or by setting ${envVar} to the absolute path.` : ".")
  );
}
