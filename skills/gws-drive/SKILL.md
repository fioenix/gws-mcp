---
name: gws-drive
description: "Manage Google Drive with the gws CLI — search files with the q query language, download/export content, upload media, create folders, and share via permissions."
metadata:
  version: 0.22.5
  openclaw:
    category: productivity
    requires:
      bins:
        - gws
    cliHelp: "gws drive --help"
---

# gws-drive

Manage files, folders, and shared drives through the locally-authenticated `gws` CLI.

## Discover before you call

```bash
gws drive --help
gws schema drive.files.list
gws schema drive.files.create
```

## Search files (the `q` query language)

```bash
gws drive files list --params '{
  "q": "name contains '"'"'report'"'"' and trashed = false",
  "fields": "files(id,name,mimeType,modifiedTime,parents)",
  "pageSize": 50
}'
```

- Always pass a `fields` mask — the default omits most useful fields (you usually want
  `files(id,name,mimeType,modifiedTime,owners,parents)`).
- Common `q` clauses (combine with `and`):
  - `name contains 'x'`, `name = 'exact.pdf'`
  - `mimeType = 'application/vnd.google-apps.folder'` (folders only)
  - `'<FOLDER_ID>' in parents` (children of a folder)
  - `trashed = false`, `starred = true`, `modifiedTime > '2026-01-01T00:00:00'`
  - `fullText contains 'phrase'`
- Single quotes inside `q` must be escaped for the shell — easiest is to write the whole
  `--params` JSON to a file and pass `--params "$(cat /tmp/q.json)"`.
- Searching a shared drive: add `"corpora":"drive","driveId":"...","includeItemsFromAllDrives":true,"supportsAllDrives":true`.

## Download / export content

```bash
# Binary file (PDF, image, etc.) — alt=media + --output
gws drive files get --params '{"fileId":"FILE_ID","alt":"media"}' --output /tmp/file.pdf

# Google-native doc (Docs/Sheets/Slides) — must EXPORT, not media
gws drive files export --params '{"fileId":"FILE_ID","mimeType":"application/pdf"}' --output /tmp/doc.pdf
```

Google-native files have no byte stream; `alt=media` on them fails — use `files export`
with a target `mimeType` (`application/pdf`, `text/csv`, `text/plain`,
`application/vnd.openxmlformats-officedocument.*`).

## Create folders & upload files

```bash
# Folder
gws drive files create --json '{"name":"Q2 Reports","mimeType":"application/vnd.google-apps.folder"}'

# Upload a local file into a folder
gws drive files create \
  --params '{"uploadType":"multipart"}' \
  --json '{"name":"data.csv","parents":["FOLDER_ID"]}' \
  --upload /absolute/host/path/data.csv --upload-content-type text/csv
```

When inside a sandbox via `gws_call`, the `upload` path must be a **host** path — write
the file to a host-shared location first; sandbox-only paths will not resolve.

## Share (permissions)

```bash
gws drive permissions create --params '{"fileId":"FILE_ID","sendNotificationEmail":false}' \
  --json '{"role":"reader","type":"user","emailAddress":"teammate@yody.vn"}'
```

`role`: `reader` | `commenter` | `writer` | `owner`. `type`: `user` | `group` |
`domain` | `anyone`. Use `"type":"anyone","role":"reader"` for a public link.

## Gotchas

- `files delete` is permanent (skips trash). To trash instead:
  `files update --params '{"fileId":"..."}' --json '{"trashed":true}'`.
- Paginate large listings: add `pageAll:true` (MCP) or loop on `nextPageToken`.
- Drive IDs ≠ Docs/Sheets/Slides app behaviour — to edit content use the app-specific
  skill ([[gws-docs]], [[gws-sheets]], [[gws-slides]]); Drive only moves the bytes/metadata.
