import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Env vars that must never leak from one profile into the next spawn.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS  — inert for gws, but beats the ADC symlink for
 *                                     every google-auth library; a leftover makes a
 *                                     switch look like it worked when it didn't.
 *   GOOGLE_WORKSPACE_PROJECT_ID     — makes gws send a quota project, which 403s
 *                                     unless the signed-in account holds
 *                                     serviceusage.services.use on it.
 *   ...KEYRING_BACKEND              — mismatched backend makes gws fail to read the
 *                                     other profile's token cache and clear it.
 */
const CLEARED_ON_SWITCH = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_WORKSPACE_PROJECT_ID",
  "GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND",
] as const;

const VALID_PROFILE = /^[a-z0-9][a-z0-9._-]*$/i;

export interface ProfileInfo {
  name: string;
  account: string | null;
  project: string | null;
  credentialsFile: string;
  configDir: string;
  credentialsExist: boolean;
  configDirExists: boolean;
  clientSecret: string;
  scopesFile: string;
  active: boolean;
}

export type EnvOverlay = Record<string, string | undefined>;

/** Apply an overlay to a base env; `undefined` means unset. */
export function applyOverlay(base: NodeJS.ProcessEnv, overlay: EnvOverlay): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

function readLine(path: string): string | null {
  try {
    const s = readFileSync(path, "utf8").trim();
    return s || null;
  } catch {
    return null;
  }
}

/**
 * Holds the profile that subsequent `gws` spawns run as.
 *
 * The switch has to live here rather than in process.env at startup: `gcp use`
 * exports into the shell that ran it, and the MCP server is a long-lived process
 * that never sees that shell. Keeping the choice in memory and rebuilding the
 * child env on every spawn is what makes `gws_profile_use` take effect without a
 * restart.
 */
export class ProfileManager {
  readonly root: string;
  /** Host pinned GOOGLE_WORKSPACE_CLI_* paths rather than (or as well as) naming a profile. */
  readonly pinned: boolean;
  private readonly startupName: string | null;
  /**
   * Paths the host set itself, as opposed to the ones resolveProfile() derived from
   * GWS_PROFILE. `resolveProfile` runs before us and uses `||=`, so by the time we
   * read the env both cases look identical — a value that differs from what the
   * profile would produce is the host's own, and must keep winning. Overwriting it
   * would silently point gws at a different token cache, i.e. a different identity.
   */
  private readonly pinnedCredentials: string | null;
  private readonly pinnedConfigDir: string | null;
  private activeName: string | null;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.root = env.GWS_PROFILE_ROOT?.trim() || join(homedir(), ".config", "gcloud", "profiles");
    const named = env.GWS_PROFILE?.trim() || null;
    this.activeName = named;
    this.startupName = named;

    const envCredentials = env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE?.trim() || null;
    const envConfigDir = env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR?.trim() || null;
    const derived = named ? this.describePaths(named) : null;
    this.pinnedCredentials = envCredentials && envCredentials !== derived?.credentialsFile ? envCredentials : null;
    this.pinnedConfigDir = envConfigDir && envConfigDir !== derived?.configDir ? envConfigDir : null;
    this.pinned = !!(this.pinnedCredentials || this.pinnedConfigDir);
  }

  private describePaths(name: string): { credentialsFile: string; configDir: string } {
    const dir = join(this.root, name);
    return {
      credentialsFile: join(dir, "gcloud", "application_default_credentials.json"),
      configDir: join(dir, "gws"),
    };
  }

  get active(): string | null {
    return this.activeName;
  }

  dirFor(name: string): string {
    if (!VALID_PROFILE.test(name)) throw new Error(`Invalid profile name: ${JSON.stringify(name)}`);
    return join(this.root, name);
  }

  describe(name: string): ProfileInfo {
    const dir = this.dirFor(name);
    const credentialsFile = join(dir, "gcloud", "application_default_credentials.json");
    const configDir = join(dir, "gws");
    return {
      name,
      account: readLine(join(dir, "account")),
      project: readLine(join(dir, "project")),
      credentialsFile,
      configDir,
      credentialsExist: existsSync(credentialsFile),
      configDirExists: existsSync(configDir),
      clientSecret: join(dir, "client_secret.json"),
      scopesFile: join(dir, "scopes"),
      active: name === this.activeName,
    };
  }

  list(): ProfileInfo[] {
    let names: string[] = [];
    try {
      names = readdirSync(this.root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && VALID_PROFILE.test(d.name))
        .map((d) => d.name)
        .sort();
    } catch {
      return [];
    }
    return names.map((n) => this.describe(n));
  }

  /** Env overlay for an arbitrary profile — used to probe a profile we are not running as. */
  envOverlayFor(name: string): EnvOverlay {
    const info = this.describe(name);
    const overlay: EnvOverlay = {
      GWS_PROFILE: name,
      GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: info.credentialsFile,
      GOOGLE_WORKSPACE_CLI_CONFIG_DIR: info.configDir,
    };
    for (const k of CLEARED_ON_SWITCH) overlay[k] = undefined;
    return overlay;
  }

  /**
   * Env overlay for the profile currently selected.
   *
   * While we are still on the startup profile, paths the host pinned itself keep
   * winning — that is the documented contract of GOOGLE_WORKSPACE_CLI_*. Once the
   * agent switches to a different profile it has explicitly asked for that identity,
   * so the profile's own paths take over.
   */
  envOverlay(): EnvOverlay {
    if (!this.activeName) return {};
    const overlay = this.envOverlayFor(this.activeName);
    if (this.activeName === this.startupName) {
      if (this.pinnedCredentials) overlay.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = this.pinnedCredentials;
      if (this.pinnedConfigDir) overlay.GOOGLE_WORKSPACE_CLI_CONFIG_DIR = this.pinnedConfigDir;
    }
    return overlay;
  }

  use(name: string): ProfileInfo {
    const info = this.describe(name);
    if (!existsSync(this.dirFor(name))) {
      const known = this.list().map((p) => p.name);
      throw new Error(
        `No profile "${name}" under ${this.root}. Known profiles: ${known.join(", ") || "(none)"}`,
      );
    }
    if (!info.credentialsExist) {
      throw new Error(
        `Profile "${name}" has no credentials at ${info.credentialsFile}. ` +
          `Ask the user to run: gcp login ${name}`,
      );
    }
    this.activeName = name;
    return this.describe(name);
  }
}
