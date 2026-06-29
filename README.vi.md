# gws-mcp

[![npm version](https://img.shields.io/npm/v/gws-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/gws-mcp)
[![CI](https://github.com/fioenix/gws-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/fioenix/gws-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](./package.json)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue)](https://modelcontextprotocol.io)

> 🌐 **Ngôn ngữ:** [English](./README.md) · Tiếng Việt (file này)

MCP server wrap [`gws`](https://github.com/googleworkspace/cli) (Google Workspace CLI) trên host, cho **Claude Desktop / Claude Code / Claude Cowork** dùng Google Workspace mà không phải copy OAuth token hay chạy `gws auth login` lại.

> **Lý do tồn tại:** `gws` lưu OAuth token trong keyring của user. Bản thân Claude Cowork là Claude Desktop chạy local nên có thể spawn `gws` thẳng — nhưng làm thế model phải tự nhớ `gws drive files list --params '...'` qua Bash, dễ sai cú pháp và không có schema introspection. MCP server này cho model một interface có structured schema (`gws_schema`, `gws_call`), audit log đầy đủ, và policy whitelist/denylist — sạch hơn nhiều so với để LLM gõ shell.

---

## 1. Yêu cầu

- `gws` CLI đã cài và đã `gws auth login` thành công.
  ```bash
  gws --version           # >= 0.22.x
  gws drive files list --params '{"pageSize": 1}'   # phải trả JSON, không lỗi auth
  ```
- Node.js >= 20.

## 2. Cài đặt

### Từ npm (khuyến nghị)

```bash
npm install -g gws-mcp
```

Hoặc chạy trực tiếp không cần cài:

```bash
npx gws-mcp --help
```

### Từ source

```bash
git clone https://github.com/fioenix/gws-mcp.git
cd gws-mcp
npm install
npm run build
npm link        # exposes `gws-mcp` globally
```

Verify:
```bash
which gws-mcp   # -> /opt/homebrew/bin/gws-mcp (hoặc tương đương)
gws-mcp --help
```

## 3. Đăng ký với Claude Desktop / Cowork / Code (stdio — recommended)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop / Cowork trên macOS):

```jsonc
{
  "mcpServers": {
    "gws": {
      "command": "gws-mcp",
      "args": ["stdio"],
      "env": {
        "GWS_MCP_ALLOWED_SERVICES": "drive,sheets,docs,calendar,gmail,tasks",
        "GWS_MCP_DENIED_METHODS": "drive.files.delete,gmail.users.messages.send",
        "GWS_MCP_AUDIT_LOG": "/Users/<you>/.cache/gws-mcp/audit.log"
      }
    }
  }
}
```

Nếu không `npm link`, dùng absolute path:

```jsonc
{
  "mcpServers": {
    "gws": {
      "command": "node",
      "args": ["/Users/<you>/Projects/gws-mcp/dist/index.js", "stdio"]
    }
  }
}
```

Restart Claude Desktop → trong chat thấy `gws` server kèm 4 tool (`gws_list_services`, `gws_help`, `gws_schema`, `gws_call`).

### Cho Claude Code CLI

```bash
claude mcp add gws -- gws-mcp stdio
```

## 4. Tool / Resource / Prompt MCP expose

### Tools

| Tool | Mục đích |
|---|---|
| `gws_list_services` | Liệt kê service (drive, sheets, gmail, …) được host cho phép. |
| `gws_help` | Run `gws <args…> --help` để khám phá resource và method. |
| `gws_schema` | Trả JSON schema cho `service.resource.method` — gọi trước khi `gws_call`. |
| `gws_call` | Dispatch tới `gws` với `service`, `resource`, `method`, `params`, `json`, …. |
| `gws_list_skills` | Liệt kê skill guide bundle sẵn trong server (`skills/gws-*`). |
| `gws_get_skill` | Đọc nội dung đầy đủ của một skill guide (markdown). |

Flow chuẩn cho LLM:

```
gws_list_services
  → gws_help args:["drive"]              # khám phá resource
  → gws_schema target:"drive.files.list" # đọc param shape
  → gws_call service:drive resource:files method:list params:{"pageSize":10}
```

**Debugging body shape an toàn**: thêm `dryRun:true` vào `gws_call` — server sẽ in HTTP body + URL sẽ-được-gửi mà không gọi Google. Hữu ích cho method có complex `--json` body (`docs.documents.batchUpdate`, `sheets.spreadsheets.batchUpdate`, `calendar.events.insert`, …).

**Lưu ý về `json` arg**: gửi object/array JS thẳng (preferred), KHÔNG `JSON.stringify` trước khi gọi tool — server tự stringify một lần. Wrapper có defensive logic: nếu LLM lỡ gửi string đã JSON-encode, server detect và pass-through verbatim (không double-encode).

### Resources

| URI | Nội dung |
|---|---|
| `gws://services` | JSON list service đang được phép. |
| `gws-skill://_index` | JSON index toàn bộ skill (name, description, version, URI). |
| `gws-skill://<name>` | Raw `SKILL.md` của từng skill, ví dụ `gws-skill://gws-drive`. |

### Prompts

Mỗi skill được expose thành một MCP prompt cùng tên (`gws-drive`, `gws-sheets`, `gws-tasks`, …). Claude Desktop hiện list này trong UI "Attach from MCP" / prompt picker — user click một phát là skill được inject vào conversation như authoritative reference.

### Skills layer

Package này bundle sẵn 6 skill guide bám workflow thật trong `skills/gws-*/SKILL.md` (gws-sheets, gws-slides, gws-drive, gws-gmail, gws-calendar, gws-docs). Server đọc **tại chỗ** từ bundled dir của chính nó — không có bước install, không bao giờ copy vào thư mục user-scoped như `~/.agents/skills` (nơi các agent khác trên máy sẽ tự nạp lên). Skill ở riêng trong server này và **lazy**.

Nghĩa là khi user prompt "đọc danh sách file Drive", model có thể:
1. Gọi `gws_list_skills` để biết có guide nào (chỉ index 1 dòng/skill).
2. Gọi `gws_get_skill name:"gws-drive"` → body đầy đủ **chỉ nạp vào context lúc này**.
3. Áp guide đó vào `gws_call` thay vì đoán params.

Tuỳ biến:
- `GWS_MCP_SKILLS_DIR=/path/to/skills` (mặc định: bundled `skills/`)
- `GWS_MCP_SKILLS_PREFIX=gws-` (đổi nếu muốn mount tên khác)
- `GWS_MCP_SKILLS_DISABLED=1` (tắt hẳn layer này)

## 5. Biến môi trường

Xem `.env.example` cho danh sách đầy đủ. Quan trọng:

| Env | Mặc định | Ý nghĩa |
|---|---|---|
| `GWS_MCP_GWS_BIN` | `gws` | Path tới binary nếu không có trong PATH. |
| `GWS_MCP_CALL_TIMEOUT_MS` | `60000` | Hard timeout cho mỗi `gws` call. |
| `GWS_MCP_MAX_OUTPUT_BYTES` | `1048576` | Giới hạn stdout, vượt thì truncate. |
| `GWS_MCP_ALLOWED_SERVICES` | empty=all | Whitelist, ví dụ `drive,sheets,docs,calendar`. |
| `GWS_MCP_DENIED_METHODS` | empty | Denylist, ví dụ `gmail.users.messages.send,drive.files.delete`. |
| `GWS_MCP_AUDIT_LOG` | empty=stderr | File NDJSON ghi mọi tool call. |
| `GWS_MCP_SKILLS_DIR` | bundled `skills/` | Thư mục chứa skill guides `gws-*`. Mặc định dùng bộ bundle sẵn; override để dùng bộ riêng. |
| `GWS_MCP_SKILLS_PREFIX` | `gws-` | Prefix subdir để filter (`gws-*`). |
| `GWS_MCP_SKILLS_DISABLED` | unset | `1` để tắt skills layer. |

## 6. Bảo mật

1. **Least-privilege**: `GWS_MCP_ALLOWED_SERVICES` chỉ mở service cần dùng. Ví dụ chỉ Drive + Sheets cho phiên Cowork: `GWS_MCP_ALLOWED_SERVICES=drive,sheets`.
2. **Denylist destructive ops**: `GWS_MCP_DENIED_METHODS=drive.files.delete,gmail.users.messages.send,calendar.events.delete`.
3. **Audit log**: `GWS_MCP_AUDIT_LOG=~/.cache/gws-mcp/audit.log` — NDJSON trail cho audit / compliance / forensics.
4. **Upload paths là host paths**: `upload`/`output` trỏ tới file trên máy host. LLM trong Cowork nếu tạo file tạm thì file đó nằm trên cùng máy host (vì Cowork = Desktop local) — vẫn ổn.

## 7. (Optional) HTTP mode — cho true remote sandbox

Chỉ dùng khi client MCP **không** thể spawn child process tới host (Vercel Sandbox, Docker worker, remote container, agent chạy trên server khác).

```bash
export GWS_MCP_AUTH_TOKEN=$(openssl rand -hex 32)
gws-mcp http
# -> [gws-mcp] HTTP transport ready at http://127.0.0.1:8765/mcp
```

Expose qua tunnel:

| Cách | Lệnh |
|---|---|
| **Cloudflare Tunnel** | `cloudflared tunnel --url http://127.0.0.1:8765` |
| **ngrok** | `ngrok http 8765` |
| **Tailscale** | `GWS_MCP_HTTP_HOST=0.0.0.0 gws-mcp http` |

Client config:

```json
{
  "mcpServers": {
    "gws": {
      "url": "https://<tunnel>/mcp",
      "headers": { "Authorization": "Bearer <GWS_MCP_AUTH_TOKEN>" }
    }
  }
}
```

> Token này = quyền Google Workspace của tài khoản `gws auth login`. Rotate thường xuyên. Không bao giờ set `GWS_MCP_HTTP_INSECURE=1` cho endpoint public.

Env riêng cho HTTP mode: `GWS_MCP_HTTP_HOST`, `GWS_MCP_HTTP_PORT` (default 8765), `GWS_MCP_HTTP_PATH` (default `/mcp`), `GWS_MCP_HTTP_CORS_ORIGINS`. Xem `.env.example`.

## 8. Smoke test

```bash
npm run build
GWS_MCP_AUTH_TOKEN=test gws-mcp http &
node test/smoke-http.mjs
kill %1
```

Kỳ vọng: health 200, no-auth 401, auth init 200 + session id, `gws_list_services` trả ra 18 service.

## 9. Troubleshooting

| Triệu chứng | Khả năng cao |
|---|---|
| Tool call trả `exit code 2` | Auth hết hạn trên host. Chạy `gws auth login` lại. |
| `exit code 3` | Param JSON sai shape. Gọi `gws_schema` trước, đối chiếu lại. |
| `exit code 4` | gws chưa fetch được discovery API — kiểm tra mạng host. |
| Claude Desktop không thấy server | Sai path `command`, hoặc chưa restart Desktop. Xem `~/Library/Logs/Claude/mcp*.log`. |
| Stdout truncated | Tăng `GWS_MCP_MAX_OUTPUT_BYTES` hoặc dùng `pageAll:true` với `pageLimit` nhỏ. |

## 10. Đóng góp

Xem [CONTRIBUTING.md](./CONTRIBUTING.md). Tóm tắt:

- Conventional Commits (`feat:`, `fix:`, `chore:`…), commit nhỏ và rõ ràng.
- `npm run typecheck`, `npm run build`, và toàn bộ `test/*.mjs` phải pass trước khi mở PR.
- Thay đổi surgical — không refactor code lân cận trong cùng commit.

Code of Conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
Báo lỗ hổng bảo mật: [SECURITY.md](./SECURITY.md).

## 11. License

[MIT](./LICENSE). Không phải sản phẩm chính thức của Google.
