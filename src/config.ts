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

export function loadConfig(overrides: Partial<{ transport: Transport }> = {}): Config {
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
