---
name: gws-gmail
description: "Send, search, read, and label Gmail with the gws CLI — RFC 822 + base64url for sending, the q search syntax, reading message bodies, and managing labels."
metadata:
  version: 0.22.5
  openclaw:
    category: productivity
    requires:
      bins:
        - gws
    cliHelp: "gws gmail --help"
---

# gws-gmail

Send and manage email through the locally-authenticated `gws` CLI. `userId` is almost
always `me` (the authenticated account).

## Discover before you call

```bash
gws gmail --help
gws schema gmail.users.messages.send
gws schema gmail.users.messages.list
```

## Search messages (the `q` syntax)

```bash
gws gmail messages list --params '{
  "userId": "me",
  "q": "from:boss@yody.vn is:unread newer_than:7d",
  "maxResults": 20
}'
```

`q` is the same syntax as the Gmail search box: `from:`, `to:`, `subject:`,
`has:attachment`, `is:unread`, `label:`, `after:2026/01/01`, `newer_than:7d`,
`larger:5M`. `list` returns only message **ids** — fetch each with `messages get`.

## Read a message

```bash
gws gmail messages get --params '{"userId":"me","id":"MSG_ID","format":"full"}'
```

`format`: `full` (headers + parsed body parts), `metadata` (headers only),
`raw` (base64url RFC 822), `minimal`. The plain-text body lives in
`payload.parts[].body.data` (base64url) — decode it; multipart messages nest parts.

## Send mail (RFC 822 → base64url `raw`)

The API takes one field, `raw`: a full RFC 822 message, base64**url**-encoded. Build it
in the shell so headers and UTF-8 bodies are correct:

```bash
RAW=$(printf 'To: teammate@yody.vn\r\nSubject: =?UTF-8?B?%s?=\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n%s' \
  "$(printf 'Báo cáo Q2' | base64)" "Chào team, xem báo cáo đính kèm nhé." \
  | base64 | tr '+/' '-_' | tr -d '=')

gws gmail messages send --params '{"userId":"me"}' --json "{\"raw\":\"$RAW\"}"
```

- Non-ASCII **subjects** must be RFC 2047 encoded (`=?UTF-8?B?<base64>?=`); the **body**
  just needs `Content-Type: ...; charset="UTF-8"`.
- `tr '+/' '-_' | tr -d '='` converts standard base64 → base64url (Gmail requires url).
- Safer for complex/HTML mail: write the full MIME message to a file, then
  `RAW=$(base64 < /tmp/mail.eml | tr '+/' '-_' | tr -d '=')`.
- Reply in-thread: add `"threadId":"<THREAD_ID>"` in the `--json` body and set the
  `In-Reply-To` / `References` headers in the raw message.

## Drafts & labels

```bash
gws gmail drafts create --params '{"userId":"me"}' --json "{\"message\":{\"raw\":\"$RAW\"}}"
gws gmail labels list --params '{"userId":"me"}'
gws gmail messages modify --params '{"userId":"me","id":"MSG_ID"}' \
  --json '{"addLabelIds":["STARRED"],"removeLabelIds":["UNREAD"]}'
```

## Gotchas

- `send` and `delete` are exactly the operations a host policy may block
  (`GWS_MCP_DENIED_METHODS`) — expect a denial error and fall back to `drafts create`
  for review if sending is disabled.
- Standard base64 (`+`, `/`, `=`) in `raw` → 400. It must be base64url.
- `messages delete` is permanent; `messages trash` is the reversible one.
