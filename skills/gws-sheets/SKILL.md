---
name: gws-sheets
description: "Read and write Google Sheets with the gws CLI — values get/update/append/batchGet, A1 ranges with non-ASCII tab names, formula vs value rendering, and bulk writes."
metadata:
  version: 0.22.5
  openclaw:
    category: productivity
    requires:
      bins:
        - gws
    cliHelp: "gws sheets --help"
---

# gws-sheets

Read and write spreadsheets through the locally-authenticated `gws` CLI. Route the
underlying API through `gws_call` when inside a sandbox, or run `gws` directly in a
shell on the host (the host path supports shell composition the MCP tool cannot).

## Discover before you call

```bash
gws sheets --help
gws schema sheets.spreadsheets.values.get      # exact params/body for any method
gws schema sheets.spreadsheets.values.update
```

`spreadsheetId` is the long token in the sheet URL:
`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.

## Read values

```bash
gws sheets spreadsheets values get --params '{
  "spreadsheetId": "1AbC...",
  "range": "Sheet1!A1:D50"
}'
```

- **Range = `<TabName>!<A1>`**. Tab names with spaces, non-ASCII (e.g. Vietnamese
  `1. CN & CĐS`), or punctuation **must be single-quoted inside the range**:
  `"range": "'1. CN & CĐS'!A1:F"`. In a POSIX shell wrap the whole `--params`
  in double quotes and escape the inner single quotes, or pass the JSON from a file.
- Open-ended ranges are fine: `"Sheet1!A:D"` (all rows), `"Sheet1!A2:F"` (from row 2).
- `"valueRenderOption": "UNFORMATTED_VALUE"` returns raw numbers/dates instead of
  display strings; `"FORMULA"` returns the formulas. Default is `FORMATTED_VALUE`.
- Read many disjoint ranges in one call with `values batchGet`:
  `--params '{"spreadsheetId":"...","ranges":["A!A1:B2","B!A1:B2"]}'`.

## Get sheet metadata (tab names, sheetIds, dimensions)

```bash
gws sheets spreadsheets get --params '{
  "spreadsheetId": "1AbC...",
  "fields": "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))"
}'
```

Always pass a `fields` mask on `get` — without it the response includes full grid
data and can be enormous.

## Write values

```bash
gws sheets spreadsheets values update \
  --params '{"spreadsheetId":"1AbC...","range":"Sheet1!A1","valueInputOption":"USER_ENTERED"}' \
  --json   '{"values":[["Name","Score"],["An",95]]}'
```

- `valueInputOption` is **required**: `USER_ENTERED` (parses formulas/dates like the
  UI) or `RAW` (store the literal string).
- `values` is a 2-D array of rows. `null` in a cell leaves it unchanged on update.
- Append a row below the existing table:
  `gws sheets spreadsheets values append --params '{...,"valueInputOption":"USER_ENTERED","insertDataOption":"INSERT_ROWS"}' --json '{"values":[[...]]}'`.
- Clear: `gws sheets spreadsheets values clear --params '{"spreadsheetId":"...","range":"Sheet1!A2:F"}'`.

## Bulk / structural edits

Adding sheets, formatting, merging cells, conditional formatting → one
`spreadsheets batchUpdate` with a `requests` array. Build the JSON in a file and pass
it (avoids shell-escaping a large payload):

```bash
gws sheets spreadsheets batchUpdate \
  --params '{"spreadsheetId":"1AbC..."}' \
  --json "$(cat /tmp/sheet_requests.json)"
```

Check `gws schema sheets.spreadsheets.batchUpdate --resolve-refs` for the request union.

## Gotchas

- Writing more rows than the grid has → the API errors; grow the grid first with a
  batchUpdate `appendDimension`/`updateSheetProperties`, or use `append`.
- `valueInputOption` omitted on update is the single most common 400.
- Large reads: prefer a tight `range` + `fields` over fetching the whole sheet.
