# server/ — the mesh relay

`relay.py` is the only thing that crosses the network between phones. Standard library
only, no dependencies, no database, no persistence.

```
python3 server/relay.py --host 0.0.0.0 --port 8090
```

| Endpoint | What |
|---|---|
| `POST /event` | one event, JSON object → `{"seq": n}` |
| `GET /events?since=n` | events with `seq > n` → `{"seq": n, "events": [...]}` |
| `GET /health` | `{"ok": true, "seq": n, "devices": [...]}` |

## Why it holds so little

Each phone's own IndexedDB (`app/log.js`) is the durable record; the relay is a
postbox. It keeps the last 600 events in memory and nothing on disk, so killing it
mid-demo costs the live supervisor view and no data.

It also refuses to carry frames. `snapshot` is not in `ALLOWED_FIELDS`, and a body
over 16 KB is rejected outright — blurred stills of workers stay on the phone that
took them. Video never comes near this: `getUserMedia` is refused on any non-localhost
origin, so the camera has to stay on the device that renders it.

Fields that are not in `ALLOWED_FIELDS` are dropped rather than relayed, and strings
are capped at 200 characters, so one misbehaving phone cannot push arbitrary payload
into another's console.

## Running it during the demo

Anything reachable from both phones works — a laptop on the venue Wi-Fi during a GREEN
window, or a phone sharing a hotspot. It is a LAN service for a two-phone demo:
`Access-Control-Allow-Origin: *`, no auth. Don't put it on a public address.

This does not break the aeroplane-mode claim, but it has to be shown honestly: on
Android, Wi-Fi can be switched back on while aeroplane mode stays on. That is the
demo state — radios to the outside world off, one local hotspot between the two
phones, no internet. Say exactly that when a judge asks, and be ready to show the
phone still has no data connection. Decide before the run whether the relay lives on
the site phone or the supervisor phone, and rehearse it that way.
