import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function bearerAuth(cfg: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (cfg.http.insecure) return next();
    if (!cfg.http.authToken) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Server misconfigured: GWS_MCP_AUTH_TOKEN is empty and GWS_MCP_HTTP_INSECURE is not set. Refusing to serve.",
        },
        id: null,
      });
      return;
    }
    const header = req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !safeEqual(m[1].trim(), cfg.http.authToken)) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    return next();
  };
}

function cors(cfg: Config) {
  const origins = cfg.http.corsOrigins;
  return (req: Request, res: Response, next: NextFunction) => {
    if (origins.length === 0) return next();
    const origin = req.header("origin");
    const allowAll = origins.includes("*");
    if (allowAll) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    } else if (origin && origins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    return next();
  };
}

export async function runHttp(buildServer: () => McpServer, cfg: Config): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use(cors(cfg));

  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, name: "gws-mcp", sessions: transports.size });
  });

  const mcpRouter = express.Router();
  mcpRouter.use(bearerAuth(cfg));

  mcpRouter.post("/", async (req, res) => {
    try {
      const sessionId = req.header("mcp-session-id");
      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports.has(sessionId)) {
        transport = transports.get(sessionId)!;
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport!);
          },
        });
        transport.onclose = () => {
          if (transport!.sessionId) transports.delete(transport!.sessionId);
        };
        const server = buildServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad request: missing or unknown session id" },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      process.stderr.write(`[gws-mcp] http-post-error: ${(e as Error).stack || (e as Error).message}\n`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  };

  mcpRouter.get("/", handleSessionRequest);
  mcpRouter.delete("/", handleSessionRequest);

  app.use(cfg.http.path, mcpRouter);

  await new Promise<void>((resolve, reject) => {
    const srv = app.listen(cfg.http.port, cfg.http.host, () => {
      process.stderr.write(
        `[gws-mcp] HTTP transport ready at http://${cfg.http.host}:${cfg.http.port}${cfg.http.path}\n`,
      );
      if (cfg.http.insecure) {
        process.stderr.write(
          `[gws-mcp] WARNING: GWS_MCP_HTTP_INSECURE=1 — no bearer-token check. Bind to loopback only.\n`,
        );
      }
      resolve();
    });
    srv.on("error", reject);
    const shutdown = (sig: string) => {
      process.stderr.write(`[gws-mcp] received ${sig}, shutting down\n`);
      srv.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  });
}
