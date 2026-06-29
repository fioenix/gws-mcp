---
name: gws-calendar
description: "Manage Google Calendar with the gws CLI — list/create/update events, all-day vs timed events with correct RFC 3339 + time zones, attendees, recurrence, and free/busy lookups."
metadata:
  version: 0.22.5
  openclaw:
    category: productivity
    requires:
      bins:
        - gws
    cliHelp: "gws calendar --help"
---

# gws-calendar

Manage calendars and events through the locally-authenticated `gws` CLI. Use the
keyword `primary` for the signed-in user's main calendar.

## Discover before you call

```bash
gws calendar --help
gws schema calendar.events.insert
gws schema calendar.events.list
```

## List / find events

```bash
gws calendar events list --params '{
  "calendarId": "primary",
  "timeMin": "2026-06-29T00:00:00+07:00",
  "timeMax": "2026-07-06T00:00:00+07:00",
  "singleEvents": true,
  "orderBy": "startTime",
  "q": "review"
}'
```

- `singleEvents:true` + `orderBy:"startTime"` expands recurring events into instances
  and sorts them — almost always what you want for "what's on my calendar".
- `timeMin`/`timeMax` are RFC 3339 with offset. The session is Asia/Ho_Chi_Minh
  (`+07:00`); always include the offset or you'll be off by 7 hours.

## Create a timed event

```bash
gws calendar events insert --params '{"calendarId":"primary","sendUpdates":"all"}' --json '{
  "summary": "Sprint review",
  "location": "Meet",
  "description": "Q2 sprint review",
  "start": { "dateTime": "2026-06-30T14:00:00+07:00", "timeZone": "Asia/Ho_Chi_Minh" },
  "end":   { "dateTime": "2026-06-30T15:00:00+07:00", "timeZone": "Asia/Ho_Chi_Minh" },
  "attendees": [ { "email": "teammate@yody.vn" } ],
  "reminders": { "useDefault": true }
}'
```

## All-day event

Use `date` (not `dateTime`); `end.date` is **exclusive** (the day after the last day):

```json
{ "summary": "Nghỉ lễ",
  "start": { "date": "2026-09-02" },
  "end":   { "date": "2026-09-03" } }
```

## Quick add, update, delete

```bash
# Natural-language create
gws calendar events quickAdd --params '{"calendarId":"primary","text":"Lunch with An tomorrow 12pm"}'

# Patch only changed fields (safer than full update)
gws calendar events patch --params '{"calendarId":"primary","eventId":"EVENT_ID"}' \
  --json '{"location":"Room 2"}'

gws calendar events delete --params '{"calendarId":"primary","eventId":"EVENT_ID","sendUpdates":"all"}'
```

- `sendUpdates`: `all` | `externalOnly` | `none` — controls attendee email notifications.
- Recurrence: add `"recurrence":["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10"]` on insert.
- Add a Google Meet link: `"conferenceData":{"createRequest":{"requestId":"<uuid>"}}`
  **and** the query param `"conferenceDataVersion":1`.

## Free/busy

```bash
gws calendar freebusy query --json '{
  "timeMin":"2026-06-30T00:00:00+07:00","timeMax":"2026-07-01T00:00:00+07:00",
  "items":[{"id":"primary"},{"id":"teammate@yody.vn"}]
}'
```

## Gotchas

- Naive `dateTime` without offset/`timeZone` → event lands in the wrong zone.
- `end.date` exclusivity on all-day events trips people up (1-day event = next day end).
- `patch` merges; `update` replaces the whole event (omitted fields get cleared).
