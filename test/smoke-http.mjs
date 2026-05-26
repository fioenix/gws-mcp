const base = "http://127.0.0.1:8771";

async function getHealth() {
  const r = await fetch(`${base}/healthz`);
  return { status: r.status, body: await r.text() };
}

async function initNoAuth() {
  const r = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
    }),
  });
  return { status: r.status, body: await r.text() };
}

async function initAuth() {
  const r = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer testtoken123",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "0" } },
    }),
  });
  return { status: r.status, sessionId: r.headers.get("mcp-session-id"), body: await r.text() };
}

async function callTool(sessionId, name, args) {
  const r = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer testtoken123",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return { status: r.status, body: await r.text() };
}

async function notifyInit(sessionId) {
  await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer testtoken123",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
}

(async () => {
  console.log("health:", JSON.stringify(await getHealth()));
  console.log("noauth:", JSON.stringify(await initNoAuth()));
  const init = await initAuth();
  console.log("auth init:", init.status, "session:", init.sessionId);
  console.log("auth init body preview:", init.body.slice(0, 200));
  if (init.sessionId) {
    await notifyInit(init.sessionId);
    const t = await callTool(init.sessionId, "gws_list_services", {});
    console.log("tool call status:", t.status);
    console.log("tool call body preview:", t.body.slice(0, 400));
  }
})();
