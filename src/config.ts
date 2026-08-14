import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function getEnv(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function getEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Transport = "stdio" | "http";

export interface Config {
  transport: Transport;
  http: {
    host: string;
    port: number;
    path: string;
    authToken: string;
    insecure: boolean;
    corsOrigins: string[];
  };
  gws: {
    bin: string;
    timeoutMs: number;
    maxOutputBytes: number;
  };
  safety: {
    allowedServices: Set<string>;
    deniedMethods: Set<string>;
    auditLog: string;
  };
  skills: {
    dir: string;
    prefix: string;
    enabled: boolean;
  };
}

/**
 * `GWS_PROFILE=work` expands to the gws env vars for that profile, so a host
 * config only names the profile instead of repeating two absolute paths.
 *
 *   <root>/<profile>/gcloud/application_default_credentials.json  -> credentials
 *   <root>/<profile>/gws                                          -> config dir (token cache)
 *
 * Root defaults to ~/.config/gcloud/profiles, override with GWS_PROFILE_ROOT.
 * Explicitly set GOOGLE_WORKSPACE_CLI_* vars win, so a host can still pin paths.
 *
 * The config dir must stay per-profile: gws caches tokens there, and sharing one
 * between profiles makes them read each other's identity.
 */
export function resolveProfile(env: NodeJS.ProcessEnv = process.env): void {
  const profile = env.GWS_PROFILE?.trim();
  if (!profile) return;

  const root = env.GWS_PROFILE_ROOT?.trim() || join(homedir(), ".config", "gcloud", "profiles");
  const dir = join(root, profile);
  const credentials = join(dir, "gcloud", "application_default_credentials.json");

  // Fail loudly. Falling through would let gws pick up the default config dir and
  // run as whatever identity happens to live there.
  if (!existsSync(credentials)) {
    throw new Error(
      `GWS_PROFILE="${profile}": credentials not found at ${credentials}. ` +
        `Run: gcloud auth application-default login --client-id-file=${join(dir, "client_secret.json")} --scopes=...`,
    );
  }

  env.GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE ||= credentials;
  env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR ||= join(dir, "gws");
}

export function loadConfig(overrides: Partial<{ transport: Transport }> = {}): Config {
  resolveProfile();

  const envTransport = getEnv("GWS_MCP_TRANSPORT", "stdio") as Transport;
  const transport: Transport = overrides.transport ?? (envTransport === "http" ? "http" : "stdio");

  const allowed = parseList(getEnv("GWS_MCP_ALLOWED_SERVICES"));
  const denied = parseList(getEnv("GWS_MCP_DENIED_METHODS"));

  return {
    transport,
    http: {
      host: getEnv("GWS_MCP_HTTP_HOST", "127.0.0.1"),
      port: getEnvInt("GWS_MCP_HTTP_PORT", 8765),
      path: getEnv("GWS_MCP_HTTP_PATH", "/mcp"),
      authToken: getEnv("GWS_MCP_AUTH_TOKEN"),
      insecure: getEnv("GWS_MCP_HTTP_INSECURE") === "1",
      corsOrigins: parseList(getEnv("GWS_MCP_HTTP_CORS_ORIGINS")),
    },
    gws: {
      bin: getEnv("GWS_MCP_GWS_BIN", "gws"),
      timeoutMs: getEnvInt("GWS_MCP_CALL_TIMEOUT_MS", 60_000),
      maxOutputBytes: getEnvInt("GWS_MCP_MAX_OUTPUT_BYTES", 1_048_576),
    },
    safety: {
      allowedServices: new Set(allowed),
      deniedMethods: new Set(denied),
      auditLog: getEnv("GWS_MCP_AUDIT_LOG"),
    },
    skills: {
      dir: getEnv("GWS_MCP_SKILLS_DIR"),
      prefix: getEnv("GWS_MCP_SKILLS_PREFIX", "gws-"),
      enabled: getEnv("GWS_MCP_SKILLS_DISABLED") !== "1",
    },
  };
}
