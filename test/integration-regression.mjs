// Regression check: methods that previously worked must still work.
// We test argv shapes (not real API hits) — those argv shapes are exactly what
// `spawn(bin, args)` receives, so if they match the pre-fix expectation we're safe.

import assert from "node:assert/strict";
import { GwsClient } from "../dist/gws.js";

const cfg = {
  transport: "stdio",
  http: { host: "", port: 0, path: "", authToken: "", insecure: false, corsOrigins: [] },
  gws: { bin: "gws", timeoutMs: 1000, maxOutputBytes: 1000 },
  safety: { allowedServices: new Set(), deniedMethods: new Set(), auditLog: "" },
  skills: { dir: "", prefix: "gws-", enabled: false },
};
const c = new GwsClient(cfg);

// (a) READ method, no body — unchanged
assert.deepEqual(
  c.buildArgs({
    service: "docs",
    resource: "documents",
    method: "get",
    params: { documentId: "X" },
  }),
  ["docs", "documents", "get", "--params", '{"documentId":"X"}'],
);

// (b) Drive upload path — unchanged
assert.deepEqual(
  c.buildArgs({
    service: "drive",
    resource: "files",
    method: "update",
    params: { fileId: "X" },
    upload: "/tmp/x.png",
    uploadContentType: "image/png",
  }),
  [
    "drive",
    "files",
    "update",
    "--params",
    '{"fileId":"X"}',
    "--upload",
    "/tmp/x.png",
    "--upload-content-type",
    "image/png",
  ],
);

// (c) Sheets batchUpdate with object body — same shape as docs (proof of generality)
assert.deepEqual(
  c.buildArgs({
    service: "sheets",
    resource: "spreadsheets",
    method: "batchUpdate",
    params: { spreadsheetId: "X" },
    json: { requests: [{ updateCells: { range: { sheetId: 0 }, fields: "userEnteredValue" } }] },
  }),
  [
    "sheets",
    "spreadsheets",
    "batchUpdate",
    "--params",
    '{"spreadsheetId":"X"}',
    "--json",
    '{"requests":[{"updateCells":{"range":{"sheetId":0},"fields":"userEnteredValue"}}]}',
  ],
);

// (d) Paginated list — unchanged
assert.deepEqual(
  c.buildArgs({
    service: "drive",
    resource: "files",
    method: "list",
    params: { pageSize: 10 },
    pageAll: true,
    pageLimit: 5,
  }),
  ["drive", "files", "list", "--params", '{"pageSize":10}', "--page-all", "--page-limit", "5"],
);

// (e) Empty params object → omitted (not passed as --params {})
assert.deepEqual(
  c.buildArgs({
    service: "drive",
    resource: "about",
    method: "get",
    params: {},
  }),
  ["drive", "about", "get"],
);

// (f) calendar.events.insert with object body — common complex-body method
assert.deepEqual(
  c.buildArgs({
    service: "calendar",
    resource: "events",
    method: "insert",
    params: { calendarId: "primary" },
    json: {
      summary: "Meet",
      start: { dateTime: "2026-01-01T10:00:00+07:00" },
      end: { dateTime: "2026-01-01T11:00:00+07:00" },
    },
  }),
  [
    "calendar",
    "events",
    "insert",
    "--params",
    '{"calendarId":"primary"}',
    "--json",
    '{"summary":"Meet","start":{"dateTime":"2026-01-01T10:00:00+07:00"},"end":{"dateTime":"2026-01-01T11:00:00+07:00"}}',
  ],
);

console.log("OK — 6 regression cases pass (read, upload, sheets bU, paginated, empty-params, calendar insert)");
