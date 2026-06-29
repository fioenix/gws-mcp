---
name: gws-docs
description: "Read and write Google Docs with the gws CLI — read the structured document, insert/replace/style text via batchUpdate, and the reverse-order insertion rule for index stability."
metadata:
  version: 0.22.5
  openclaw:
    category: productivity
    requires:
      bins:
        - gws
    cliHelp: "gws docs --help"
---

# gws-docs

Read and edit documents through the locally-authenticated `gws` CLI.

## Discover before you call

```bash
gws docs --help
gws schema docs.documents.batchUpdate --resolve-refs   # the request union
```

`documentId` is the token in the URL:
`https://docs.google.com/document/d/<DOCUMENT_ID>/edit`.

## Read the document

```bash
gws docs documents get --params '{"documentId":"1Doc..."}'
```

The body is `body.content[]` — a list of structural elements (`paragraph`, `table`,
`sectionBreak`). Each has a `startIndex`/`endIndex` (character offsets) used to target
edits. Text lives in `paragraph.elements[].textRun.content`. Read this first to find the
indices you want to edit.

## Edit: documents batchUpdate

All mutations are `requests` in one `batchUpdate`. Build large payloads in a file:

```bash
cat > /tmp/doc_requests.json <<'JSON'
{ "requests": [
  { "insertText": { "location": { "index": 1 }, "text": "Báo cáo Q2\n" } },
  { "updateTextStyle": {
      "range": { "startIndex": 1, "endIndex": 11 },
      "textStyle": { "bold": true, "fontSize": { "magnitude": 18, "unit": "PT" } },
      "fields": "bold,fontSize" } }
] }
JSON

gws docs documents batchUpdate --params '{"documentId":"1Doc..."}' --json "$(cat /tmp/doc_requests.json)"
```

- **Index 1 is the start of the body** (index 0 is the document head; you cannot insert
  there). Indices are character offsets into the doc.
- `updateTextStyle` / `updateParagraphStyle` require a `fields` mask naming which
  properties you're setting — omitting it is the most common 400.
- `replaceAllText` is the clean way to fill a `{{token}}` template:
  `{"replaceAllText":{"containsText":{"text":"{{NAME}}","matchCase":true},"replaceText":"An"}}`.

## The reverse-order insertion rule

Every `insertText` shifts the indices of everything after it. When making several
positional inserts in one batch, **order requests from the highest index to the lowest**
so earlier-applied edits don't invalidate the indices of later ones. (Or insert at a
single growing point and let each insert push the rest down.)

## Create a doc

```bash
gws docs documents create --json '{"title":"Q2 Report"}'   # returns the new documentId
```

## Gotchas

- Building structure (tables, lists) is verbose — read `gws schema` for
  `insertTable`, `createParagraphBullets`, etc., and prefer `replaceAllText` on a
  pre-made template when you can.
- To export a Doc to PDF/Word/Markdown, that's a Drive operation — see [[gws-drive]]
  (`files export` with the target `mimeType`).
- `batchUpdate` is all-or-nothing: one invalid request rejects the whole batch.
