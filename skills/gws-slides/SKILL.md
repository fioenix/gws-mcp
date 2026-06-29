---
name: gws-slides
description: "Read and write Google Slides with the gws CLI — inspect the page/element tree, batchUpdate text & shapes, and export slide thumbnails to PNG via getThumbnail → download."
metadata:
  version: 0.22.5
  openclaw:
    category: productivity
    requires:
      bins:
        - gws
    cliHelp: "gws slides --help"
---

# gws-slides

Read and edit presentations through the locally-authenticated `gws` CLI.

## Discover before you call

```bash
gws slides --help
gws schema slides.presentations.batchUpdate --resolve-refs   # the request union
gws schema slides.presentations.pages.getThumbnail
```

`presentationId` is the token in the URL:
`https://docs.google.com/presentation/d/<PRESENTATION_ID>/edit`.

## Inspect the deck (always with a fields mask)

The full presentation object is huge. Pull only what you need:

```bash
# slide ids + element ids + text — enough to plan edits
gws slides presentations get --params '{
  "presentationId": "1XyZ...",
  "fields": "slides(objectId,pageElements(objectId,shape(text(textElements(textRun(content))))))"
}'

# just the deck size + slide order
gws slides presentations get --params '{"presentationId":"1XyZ...","fields":"pageSize,slides(objectId)"}'
```

You need `objectId`s (of slides and of page elements) to target any edit.

## Edit: presentations batchUpdate

Every mutation (insert text, replace text, create shape/image, move, recolor) is a
`request` in one `batchUpdate`. Build the array in a file and pass it — large payloads
are painful to escape inline:

```bash
cat > /tmp/slide_requests.json <<'JSON'
{ "requests": [
  { "replaceAllText": {
      "containsText": { "text": "{{TITLE}}", "matchCase": true },
      "replaceText": "Q2 Review" } },
  { "insertText": { "objectId": "g3ef7...", "insertionIndex": 0, "text": "Hello" } }
] }
JSON

gws slides presentations batchUpdate \
  --params '{"presentationId":"1XyZ..."}' \
  --json "$(cat /tmp/slide_requests.json)"
```

- `replaceAllText` is the cleanest way to fill a template deck built with `{{tokens}}`.
- All requests are validated together: if one is invalid the **whole batch is rejected**
  and nothing applies. Validate shapes with `gws_call ... dryRun:true` (or `--dry-run`).
- Order matters — requests apply top to bottom; an `insertText` must reference an
  object that already exists (create it earlier in the same batch if new).

## Export a slide as PNG (getThumbnail → download)

`getThumbnail` returns a JSON `{ "contentUrl": "https://..." }` — a short-lived link,
not the image bytes. Capture the URL, then download it. This is a host-shell recipe
(needs command substitution + curl), not a single MCP call:

```bash
URL=$(gws slides presentations pages getThumbnail --params '{
  "presentationId": "1XyZ...",
  "pageObjectId": "g3ef7...",
  "thumbnailProperties.mimeType": "PNG",
  "thumbnailProperties.thumbnailSize": "LARGE"
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["contentUrl"])')

curl -sL "$URL" -o /tmp/slide.png
```

`thumbnailSize`: `SMALL` | `MEDIUM` | `LARGE`. getThumbnail counts as an *expensive*
read against Slides quota — batch sparingly.

## Gotchas

- Page element coordinates use EMU (914400 EMU = 1 inch); `transform` scale/translate
  controls placement. Copy an existing element's transform as a baseline.
- You cannot set arbitrary image bytes inline — `createImage` takes a public/Drive URL.
- To duplicate a slide use `duplicateObject` with the slide's `objectId`.
