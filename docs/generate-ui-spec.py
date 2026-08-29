#!/usr/bin/env python3
"""Generate docs/safetyeye-ui.excalidraw — a hand-off spec of every SafetyEye
UI component, drawn to the real measurements and colours in the app CSS."""

import json, random, io, os

random.seed(7)
E = []          # elements
_n = [0]

def _base(t, x, y, w, h, **kw):
    _n[0] += 1
    el = {
        "id": f"e{_n[0]}", "type": t,
        "x": round(x, 2), "y": round(y, 2),
        "width": round(w, 2), "height": round(h, 2),
        "angle": 0,
        "strokeColor": kw.get("stroke", "#1e1e1e"),
        "backgroundColor": kw.get("bg", "transparent"),
        "fillStyle": kw.get("fill", "solid"),
        "strokeWidth": kw.get("sw", 1),
        "strokeStyle": kw.get("ss", "solid"),
        "roughness": 0,
        "opacity": kw.get("opacity", 100),
        "groupIds": kw.get("groups", []),
        "frameId": None,
        "roundness": ({"type": 3} if kw.get("r", True) and t == "rectangle" else None),
        "seed": random.randint(1, 2 ** 31),
        "version": 1, "versionNonce": random.randint(1, 2 ** 31),
        "isDeleted": False, "boundElements": None,
        "updated": 1, "link": None, "locked": False,
    }
    return el

def rect(x, y, w, h, **kw):
    el = _base("rectangle", x, y, w, h, **kw)
    E.append(el); return el

def ellipse(x, y, w, h, **kw):
    el = _base("ellipse", x, y, w, h, **kw)
    E.append(el); return el

def line(x1, y1, x2, y2, **kw):
    el = _base("line", min(x1, x2), min(y1, y2), abs(x2 - x1), abs(y2 - y1), **kw)
    el["points"] = [[0, 0], [round(x2 - x1, 2), round(y2 - y1, 2)]]
    el["x"], el["y"] = round(x1, 2), round(y1, 2)
    el["width"], el["height"] = round(abs(x2 - x1), 2), round(abs(y2 - y1), 2)
    el["lastCommittedPoint"] = None
    el["startBinding"] = None; el["endBinding"] = None
    el["startArrowhead"] = None; el["endArrowhead"] = None
    E.append(el); return el

def arrow(x1, y1, x2, y2, **kw):
    el = line(x1, y1, x2, y2, **kw)
    el["type"] = "arrow"; el["endArrowhead"] = "arrow"
    return el

# Excalidraw font ids: 1 hand-drawn, 2 normal (Helvetica), 3 code
FONT_UI, FONT_MONO = 2, 3

def text(x, y, s, size=14, color="#1e1e1e", align="left", font=FONT_UI, **kw):
    lines = s.split("\n")
    w = max(len(l) for l in lines) * size * 0.55
    h = len(lines) * size * 1.25
    el = _base("text", x, y, w, h, stroke=color, **kw)
    el.update({
        "fontSize": size, "fontFamily": font, "text": s,
        "textAlign": align, "verticalAlign": "top",
        "containerId": None, "originalText": s, "lineHeight": 1.25,
        "autoResize": True,
    })
    E.append(el); return el

# ── palette lifted from :root in app/index.html ────────────────────────────
BG, SURF, SURF2, SURF3 = "#0A0D11", "#12171E", "#1A212A", "#222B36"
LINE, LINE2 = "#1F2832", "#2A3542"
TEXT, MUTED, DIM = "#EDF2F7", "#93A1B1", "#5F6E7E"
MINT, MINT2, RED, BLUE, AMBER = "#00E5A0", "#5FFFC6", "#FF5A5A", "#4DA3FF", "#FFB84D"
INK, INK2, PAPER = "#1e1e1e", "#5b5b5b", "#ffffff"
NOTE = "#0f6b52"      # annotation colour
SPEC = "#9a5b00"      # measurement colour

SW, SH = 375, 812     # the screen we design to

def label(x, y, s, size=13):
    return text(x, y, s, size, NOTE)

def spec(x, y, s, size=11):
    return text(x, y, s, size, SPEC, font=FONT_MONO)

def heading(x, y, s, size=28):
    return text(x, y, s, size, INK)

def sub(x, y, s, size=13):
    return text(x, y, s, size, INK2)

# ══════════════════════════════════════════════════════════════════════════
# 0 · title
# ══════════════════════════════════════════════════════════════════════════
heading(0, -220, "SafetyEye — UI component spec", 40)
sub(0, -166,
    "Every screen and component in the app, drawn to the measurements and colours\n"
    "that are actually in the CSS. Dark panels are the real UI; the orange monospace\n"
    "notes are exact values; the green notes say what a thing does or when it changes.", 15)
sub(0, -96,
    "Target frame 375 x 812 (all values in CSS px). The app also has to hold up at\n"
    "320 wide and on a tablet, so nothing here should be pinned to one width.", 15)

# ══════════════════════════════════════════════════════════════════════════
# 1 · tokens
# ══════════════════════════════════════════════════════════════════════════
TX, TY = 0, 20
heading(TX, TY, "1 · Tokens", 24)
sub(TX, TY + 34, "These are the whole palette. Nothing in the app uses a colour outside this list.", 13)

swatches = [
    ("--bg", BG, "the page ground"),
    ("--surface", SURF, "cards, tiles"),
    ("--surface-2", SURF2, "stepper, switch"),
    ("--surface-3", SURF3, "pressed / hover"),
    ("--line", LINE, "card border"),
    ("--line-2", LINE2, "stronger border"),
    ("--text", TEXT, "primary type"),
    ("--muted", MUTED, "secondary type"),
    ("--dim", DIM, "labels, off state"),
    ("--mint", MINT, "safe, primary"),
    ("--mint-2", MINT2, "gradient top"),
    ("--red", RED, "breach, danger"),
    ("--blue", BLUE, "fire exit"),
    ("--amber", AMBER, "warning, not-yet"),
]
x, y = TX, TY + 62
for i, (name, hexv, use) in enumerate(swatches):
    cx = TX + (i % 7) * 142
    cy = y + (i // 7) * 96
    rect(cx, cy, 118, 40, bg=hexv, stroke=LINE2, sw=1)
    text(cx, cy + 46, name, 11, INK, font=FONT_MONO)
    text(cx, cy + 61, hexv.upper(), 10, SPEC, font=FONT_MONO)
    text(cx, cy + 75, use, 9.5, INK2)

ty2 = y + 210
text(TX, ty2, "Tinted fills — the same hue at 12% over the surface", 13, INK)
for i, (name, hexv) in enumerate([("--mint-dim", MINT), ("--red-dim", RED),
                                  ("--blue-dim", BLUE), ("--amber-dim", AMBER)]):
    cx = TX + i * 132
    rect(cx, ty2 + 22, 118, 34, bg=SURF, stroke=LINE)
    rect(cx, ty2 + 22, 118, 34, bg=hexv, stroke="transparent", opacity=12)
    text(cx, ty2 + 62, name + " · 12%", 10, INK2, font=FONT_MONO)

# type scale
tsx = TX + 620
text(tsx, ty2, "Type — Inter, plus JetBrains Mono for every number", 13, INK)
scale = [
    ("h2 / screen title", 27, 700, "-.032em"),
    ("card h3", 14.5, 650, "-.01em"),
    ("body", 13, 400, "0"),
    ("eyebrow", 10, 700, ".16em uppercase"),
    ("tile number (mono)", 25, 700, "-.03em"),
    ("hud stat (mono)", 12.5, 700, "-.02em"),
    ("tab label", 9.5, 650, "0"),
]
for i, (nm, sz, wt, ls) in enumerate(scale):
    yy = ty2 + 26 + i * 26
    text(tsx, yy, nm, 12, INK)
    spec(tsx + 150, yy, f"{sz}px / {wt} / {ls}")

# radii + spacing
rsx = TX + 620
text(rsx, ty2 + 226, "Radius", 13, INK)
for i, (nm, r) in enumerate([("card 18", 18), ("tile 16", 16), ("btn 15", 15),
                             ("btn.sm 13", 13), ("stepper 12", 12), ("pill 999", 24)]):
    cx = rsx + i * 84
    rect(cx, ty2 + 248, 68, 44, bg=SURF, stroke=LINE2)
    text(cx, ty2 + 298, nm, 10, INK2, font=FONT_MONO)

text(TX, ty2 + 226, "Spacing", 13, INK)
spec(TX, ty2 + 248,
     "screen gutter  .pad      18px\n"
     "card padding             16px\n"
     "card gap                 11px\n"
     "tile grid gap             9px\n"
     "tile padding         13 / 14px\n"
     "tab bar         8px 10px 20px")

# ══════════════════════════════════════════════════════════════════════════
# helpers for drawing real UI at 1:1
# ══════════════════════════════════════════════════════════════════════════
def screen(ox, oy, title, note, h=SH):
    """Phone frame. h > 812 means the tab scrolls; the fold gets marked."""
    rect(ox - 12, oy - 12, SW + 24, h + 24, bg=PAPER, stroke="#c9c9c9", sw=1)
    rect(ox, oy, SW, h, bg=BG, stroke=LINE2, sw=1)
    heading(ox, oy - 62, title, 20)
    sub(ox, oy - 34, note, 12)
    spec(ox + SW - 88, oy - 16, f"{SW} x {SH}")
    if h > SH:
        line(ox, oy + SH, ox + SW, oy + SH, stroke="#c05a2a", ss="dashed", sw=2)
        text(ox + SW + 30, oy + SH - 8, "812 fold — the viewport ends here;", 11, "#c05a2a")
        text(ox + SW + 30, oy + SH + 8, "everything under it is scrolled to", 11, "#c05a2a")
    return ox, oy

def card(x, y, w, h, bg=SURF, stroke=LINE):
    return rect(x, y, w, h, bg=bg, stroke=stroke, sw=1)

def head(x, y, eyebrow, title, subtitle, ebcol=MINT, helpbtn=True):
    ellipse(x + 18, y + 12, 6, 6, bg=ebcol, stroke="transparent")
    text(x + 30, y + 6, eyebrow, 10, ebcol)
    text(x + 18, y + 26, title, 25, TEXT)
    if subtitle:
        line(x + 18, y + 62, x + SW - 90, y + 62, stroke=LINE2, ss="dashed")
        text(x + 18, y + 70, subtitle, 12, MUTED)
        line(x + 18, y + 90, x + SW - 90, y + 90, stroke=LINE2, ss="dashed")
    if helpbtn:
        ellipse(x + SW - 48, y + 22, 30, 30, bg=SURF, stroke=LINE2)
        text(x + SW - 38, y + 30, "?", 13, MUTED)
    return y + 104

def tile(x, y, w, label_, value, hot=False, valcol=TEXT):
    card(x, y, w, 100, bg=SURF, stroke=("#4c2430" if hot else LINE))
    rect(x + 13, y + 14, 12, 12, bg="transparent", stroke=DIM, sw=1)
    text(x + 31, y + 14, label_, 10, DIM)
    text(x + 13, y + 40, value, 25, valcol, font=FONT_MONO)

def button(x, y, w, kind, text_, h=48):
    if kind == "primary":
        rect(x, y, w, h, bg=MINT, stroke="transparent")
        text(x + w / 2 - len(text_) * 3.6, y + h / 2 - 9, text_, 14, "#04120C")
    elif kind == "danger":
        rect(x, y, w, h, bg=RED, stroke="transparent")
        text(x + w / 2 - len(text_) * 3.6, y + h / 2 - 9, text_, 14, "#1a0505")
    else:
        rect(x, y, w, h, bg=SURF2, stroke=LINE2)
        text(x + w / 2 - len(text_) * 3.4, y + h / 2 - 9, text_, 13, TEXT)

def chip(x, y, text_, col, w=None):
    w = w or (len(text_) * 6.2 + 20)
    rect(x, y, w, 22, bg=col, stroke=col, opacity=18)
    rect(x, y, w, 22, bg="transparent", stroke=col, sw=1)
    text(x + 10, y + 5, text_, 10.5, col)
    return w

def switch(x, y, on=True):
    rect(x, y, 46, 27, bg=(MINT if on else SURF2), stroke=(MINT if on else LINE2),
         opacity=(24 if on else 100))
    rect(x, y, 46, 27, bg="transparent", stroke=(MINT if on else LINE2), sw=1)
    ellipse(x + (23 if on else 3), y + 3, 19, 19, bg=(MINT if on else DIM), stroke="transparent")

def tabbar(x, y, active=0, badge=None):
    rect(x, y, SW, 82, bg="#0A0D11", stroke=LINE, sw=1)
    line(x, y, x + SW, y, stroke=LINE)
    names = ["Site", "Camera", "Alerts", "Report"]
    for i, n in enumerate(names):
        cx = x + SW / 4 * i + SW / 8
        col = MINT if i == active else DIM
        rect(cx - 10, y + 14, 20, 20, bg="transparent", stroke=col, sw=1.5)
        text(cx - len(n) * 2.6, y + 40, n, 9.5, col)
        if i == 0 and active == 0:
            rect(cx - 11, y + 2, 22, 3, bg=MINT, stroke="transparent")
        if badge and i == 2:
            ellipse(cx + 8, y + 8, 18, 18, bg=RED, stroke="transparent")
            text(cx + 12, y + 12, badge, 9, "#1a0505")
    rect(x + SW / 2 - 60, y + 68, 120, 5, bg="#3a4450", stroke="transparent")

# ══════════════════════════════════════════════════════════════════════════
# 2 · the four screens
# ══════════════════════════════════════════════════════════════════════════
SCR_Y = 1050
heading(0, SCR_Y - 120, "2 · The four screens", 24)
sub(0, SCR_Y - 88,
    "Drawn at 1:1. The tab bar is fixed; everything above it scrolls in .views.\n"
    "Note the safe-area padding: on Android the WebView is inset by a native frame, not by CSS.", 13)

# ── screen A · Site ────────────────────────────────────────────────────────
ax, ay = screen(0, SCR_Y,  "A · Site", "Landing tab. The shift at a glance, then the rules, then settings.", h=1300)
cy = head(ax, ay + 8, "SITE ACTIVE", "Tower B — Level 4", "Sector 12 Construction · Shift 2 of 3")
label(ax + SW + 30, ay + 20, "Both lines are <input>s styled as\nthe heading — dashed underline,\nno edit mode, type straight in.")
arrow(ax + SW + 26, ay + 30, ax + SW - 60, ay + 40, stroke=NOTE)

tiles = [("BREACHES", "51", True, RED), ("WARNED IN TIME", "9", False, AMBER),
         ("PEOPLE NOW", "—", False, TEXT), ("CAMERA", "OFF", False, TEXT),
         ("TIME WATCHED", "04:08", False, TEXT), ("PREVENTED", "44%", False, MINT)]
tw = (SW - 36 - 9) / 2
for i, (l, v, hot, c) in enumerate(tiles):
    tile(ax + 18 + (i % 2) * (tw + 9), cy + (i // 2) * 109, tw, l, v, hot, c)
cy2 = cy + 3 * 109 + 2
label(ax + SW + 30, cy + 6, "grid2 — 1fr 1fr, gap 9.\nNumbers are mono and animate\nwith a 1.2x 'bump' on change.\n.tile.hot turns the border and\nnumber red when it matters.")

# prevention card
card(ax + 18, cy2, SW - 36, 150, bg=SURF, stroke="#4a3a1c")
text(ax + 34, cy2 + 16, "Warned before it happened", 14.5, AMBER)
chip(ax + SW - 100, cy2 + 14, "44%", AMBER, 64)
text(ax + 34, cy2 + 44, "The phone calls out when someone is heading for\nthe danger zone — before they cross it. A recorded\nbreach means the warning didn't work.", 12, MUTED)
text(ax + 34, cy2 + 104, "9", 22, AMBER, font=FONT_MONO)
text(ax + 34, cy2 + 130, "WARNINGS", 9.5, DIM)
text(ax + 150, cy2 + 104, "51", 22, RED, font=FONT_MONO)
text(ax + 150, cy2 + 130, "CROSSED ANYWAY", 9.5, DIM)
label(ax + SW + 30, cy2 + 30, "The pitch, in one card. Only\nshows once something has\nhappened — hidden at zero.")

# rules card
ry = cy2 + 161
card(ax + 18, ry, SW - 36, 200)
text(ax + 34, ry + 16, "What it watches for", 14.5, TEXT)
chip(ax + SW - 120, ry + 14, "2 of 3 on", MINT, 84)
rules = [("Someone heads for a danger zone", "Shouts a warning before they cross", RED, "On", RED),
         ("Too many people in one place", "Alerts above the limit you set below", AMBER, "Max 3", AMBER),
         ("Something blocks the fire exit", "Tap to draw the doorway to keep clear", BLUE, "Set up", DIM)]
for i, (t, s, c, act, ac) in enumerate(rules):
    yy = ry + 46 + i * 52
    rect(ax + 34, yy, 34, 34, bg=c, stroke="transparent", opacity=14)
    rect(ax + 34, yy, 34, 34, bg="transparent", stroke=c, sw=1)
    text(ax + 78, yy + 2, t, 12.5, TEXT)
    text(ax + 78, yy + 19, s, 10.5, MUTED)
    chip(ax + SW - 108, yy + 6, act, ac, 66)
    if i < 2:
        line(ax + 34, yy + 44, ax + SW - 34, yy + 44, stroke=LINE)
label(ax + SW + 30, ry + 40, "One row per rule. The chip on\nthe right is both status and the\ntap target that configures it.")

# stepper card
sy = ry + 211
card(ax + 18, sy, SW - 36, 64)
text(ax + 34, sy + 14, "How many people are safe here", 14.5, TEXT)
text(ax + 34, sy + 36, "Alerts above this number", 11, MUTED)
rect(ax + SW - 130, sy + 14, 96, 36, bg=SURF2, stroke=LINE2)
text(ax + SW - 120, sy + 22, "–", 17, MUTED)
text(ax + SW - 86, sy + 22, "3", 16, TEXT, font=FONT_MONO)
text(ax + SW - 52, sy + 22, "+", 17, MUTED)

# switches
for i, (t, s, on) in enumerate([("Alarm sound", "Beeps when a rule is broken", True),
                                ("Say the warning out loud", "So the floor can hear it", True)]):
    yy = sy + 75 + i * 75
    card(ax + 18, yy, SW - 36, 64)
    text(ax + 34, yy + 14, t, 14.5, TEXT)
    text(ax + 34, yy + 36, s, 11, MUTED)
    switch(ax + SW - 80, yy + 18, on)

py = sy + 225
card(ax + 18, py, SW - 36, 92, bg=SURF, stroke="#14503c")
rect(ax + 34, py + 14, 16, 16, bg="transparent", stroke=MINT, sw=1.5)
text(ax + 58, py + 14, "Nothing leaves this phone", 14, MINT)
text(ax + 34, py + 40, "The camera is read by the phone itself. No video is\nuploaded, streamed or saved.", 11.5, MUTED)
label(ax + SW + 30, py + 10, "The claim the whole product\nrests on. Give it real weight —\nthis is what a judge reads.")

button(ax + 18, py + 104, SW - 36, "primary", "Open the camera")
tabbar(ax, ay + 1300 - 82, 0)
label(ax + SW + 30, ay + 1300 - 74, "The tab bar is fixed. It sits here\nwhatever the column below is\ndoing - .views scrolls under it.")

# ── screen B · Camera ─────────────────────────────────────────────────────
bx, by = screen(760, SCR_Y, "B · Camera", "The working screen. Draw a zone, arm it, watch it.")
cy = head(bx, by + 8, "NOT WATCHING YET", "Camera", "", ebcol=MINT, helpbtn=False)
cy -= 34

# steps
for i, (n, t, done) in enumerate([("1", "Draw a zone", True), ("2", "Start watching", False),
                                  ("3", "Get alerts", False)]):
    sx = bx + 18 + i * ((SW - 36) / 3)
    w = (SW - 36) / 3 - 8
    rect(sx, cy, w, 3, bg=(MINT if done else AMBER if i == 1 else LINE2), stroke="transparent")
    ellipse(sx, cy + 12, 22, 22, bg="transparent", stroke=(MINT if done else AMBER if i == 1 else DIM), sw=1.5)
    text(sx + 7, cy + 17, n, 11, (MINT if done else AMBER if i == 1 else DIM))
    text(sx + 30, cy + 17, t, 11.5, (TEXT if i < 2 else DIM))
label(bx + SW + 30, cy - 6, "A three-step ladder, not a\nsettings screen. It is the\nfirst-run tutorial and the\npermanent status line.")

# stage
sty = cy + 48
sth = 300
rect(bx + 18, sty, SW - 36, sth, bg="#0C1218", stroke=LINE2)
# hud top
rect(bx + 30, sty + 12, 116, 26, bg="#04070A", stroke=AMBER, opacity=90)
ellipse(bx + 40, sty + 22, 7, 7, bg=AMBER, stroke="transparent")
text(bx + 52, sty + 19, "NOT STARTED", 10, AMBER)
rect(bx + SW - 148, sty + 12, 118, 26, bg="#04070A", stroke=LINE2, opacity=90)
text(bx + SW - 138, sty + 19, "BACK CAMERA", 10, MUTED)
# zone + detections
rect(bx + 150, sty + 70, 160, 150, bg=RED, stroke=RED, ss="dashed", sw=2, opacity=12)
rect(bx + 150, sty + 56, 88, 14, bg=RED, stroke="transparent")
text(bx + 155, sty + 57, "DANGER ZONE", 8, "#04070A")
for (dx, dw, col, lab) in [(60, 46, MINT, "person 93%"), (250, 44, RED, "person 91%")]:
    rect(bx + dx, sty + 120, dw, 110, bg="transparent", stroke=col, sw=1.6)
    rect(bx + dx, sty + 106, 62, 13, bg=col, stroke="transparent")
    text(bx + dx + 3, sty + 107, lab, 7.5, "#04070A")
arrow(bx + 110, sty + 175, bx + 146, sty + 165, stroke=MINT, sw=1.5)
text(bx + 78, sty + 186, "0.75s ahead", 8.5, MINT)
# hud bottom
for i, (l, v, c) in enumerate([("PEOPLE", "3", TEXT), ("WARNED", "9", AMBER),
                               ("BREACH", "51", TEXT), ("SPEED", "12ms", TEXT), ("NET", "UNUSED", MINT)]):
    hw = (SW - 36 - 8 - 4 * 5) / 5
    hx = bx + 22 + i * (hw + 5)
    rect(hx, sty + sth - 46, hw, 38, bg="#04070A", stroke=LINE2, opacity=90)
    text(hx + 5, sty + sth - 41, l, 8, DIM)
    text(hx + 5, sty + sth - 27, v, 11, c, font=FONT_MONO)
label(bx + SW + 30, sty + 8,
      "The stage is the product. Everything\nelse is chrome around it.\n\n"
      "Layers, bottom to top:\n"
      "  1  <video> (or the demo canvas)\n"
      "  2  #overlay canvas — zones + boxes\n"
      "  3  .hud — pills and stats, no taps\n"
      "  4  .alarm-flash — red inset glow\n\n"
      "Boxes ease toward the detection at\n60fps; detection itself runs at 12fps.")
spec(bx + SW + 30, sty + 210, "aspect-ratio 3/4 portrait\n16/9 when the screen is short\nobject-fit: cover")

# toolbar
ty_ = sty + sth + 12
card(bx + 18, ty_, SW - 36, 64, bg=SURF, stroke=LINE)
for i, (t, c) in enumerate([("Danger zone", RED), ("Fire exit", BLUE), ("Erase", DIM)]):
    tx_ = bx + 18 + (SW - 36) / 3 * i + (SW - 36) / 6
    rect(tx_ - 9, ty_ + 12, 18, 18, bg="transparent", stroke=c, sw=1.4)
    text(tx_ - len(t) * 3.1, ty_ + 38, t, 11.5, MUTED)
label(bx + SW + 30, ty_ + 6, "Pick a tool, then drag on the\nstage. Erase clears both zones.")

button(bx + 18, ty_ + 76, SW - 36, "primary", "Start watching")
label(bx + SW + 30, ty_ + 82, "Becomes a red 'Stop watching'\nwhile armed — same position,\nso the thumb never moves.")
button(bx + 18, ty_ + 136, (SW - 45) / 2, "ghost", "Front camera", 52)
button(bx + 27 + (SW - 45) / 2, ty_ + 136, (SW - 45) / 2, "ghost", "Demo scene", 52)
text(bx + 60, ty_ + 198, "The picture is read on this phone and never sent anywhere.", 10, DIM)
tabbar(bx, by + SH - 82, 1)

# ── screen C · Alerts ─────────────────────────────────────────────────────
cx0, cy0 = screen(1520, SCR_Y, "C · Alerts", "The log book. One row per event, with the photo.")
cy = head(cx0, cy0 + 8, "ALERT HISTORY", "Today",
          "Saved on this phone with the time and a photo.", helpbtn=True)
label(cx0 + SW + 30, cy0 + 24, "The help button here is ⌫ —\nclears today's log. Destructive,\nso it asks first.")

incidents = [("Danger zone entered", "3 people in the danger zone", "20:54:24", RED, "breach"),
             ("Warning called out", "Someone came too close · Nobody crossed", "20:54:32", AMBER, "warn"),
             ("Danger zone entered", "1 person in the danger zone", "20:54:49", RED, "breach"),
             ("Too many people", "5 people here · limit is 3", "20:55:10", AMBER, "breach"),
             ("Fire exit blocked", "A chair is blocking the fire exit", "20:56:02", BLUE, "breach")]
for i, (t, d, tm, c, kind) in enumerate(incidents):
    yy = cy + i * 86
    card(cx0 + 18, yy, SW - 36, 76, bg=SURF, stroke=LINE)
    rect(cx0 + 30, yy + 10, 56, 56, bg=SURF3, stroke=LINE2)
    text(cx0 + 40, yy + 32, "photo", 9, DIM)
    rect(cx0 + 98, yy + 12, 14, 14, bg=c, stroke="transparent", opacity=20)
    text(cx0 + 98, yy + 30, t, 12.5, TEXT)
    text(cx0 + 98, yy + 48, d, 10, MUTED)
    text(cx0 + SW - 84, yy + 12, tm, 10.5, DIM, font=FONT_MONO)
    if kind == "warn":
        chip(cx0 + SW - 96, yy + 44, "prevented", MINT, 74)
label(cx0 + SW + 30, cy + 30,
      "Two kinds of row, and the difference\nis the whole story:\n\n"
      "  breach — it happened, red/blue\n"
      "  warn   — it was called out first\n\n"
      "A warning followed by a breach inside\n4s stops counting as prevented. That\nhonesty is the point; do not hide it.")
label(cx0 + SW + 30, cy + 190, "Thumbnails are 256px, stored on\nthe phone. Blurred ones go in the\nreport; clear ones stay here.")
tabbar(cx0, cy0 + SH - 82, 2, badge="60")

# ── screen D · Report ─────────────────────────────────────────────────────
dx, dy = screen(2280, SCR_Y, "D · Report", "End of shift. One tap to a file you can send.")
cy = head(dx, dy + 8, "END OF SHIFT", "Safety report",
          "Downloads a Word .docx with the photos embedded.", helpbtn=False)

card(dx + 18, cy, SW - 36, 88)
text(dx + 34, cy + 14, "Hide identities in the report", 14.5, TEXT)
text(dx + 34, cy + 36, "You always see people clearly here on the\nphone. Only the report you send out is blurred.", 11, MUTED)
switch(dx + SW - 80, cy + 26, True)
label(dx + SW + 30, cy + 6, "Default ON. The blur happens on\nthe phone before the file exists.")

button(dx + 18, cy + 100, (SW - 45) / 2, "primary", "Download DOCX", 52)
button(dx + 27 + (SW - 45) / 2, cy + 100, (SW - 45) / 2, "ghost", "Spreadsheet", 52)
label(dx + SW + 30, cy + 106, "Both write through a native\nbridge to Downloads. The toast\nnames the path — it must not\nclaim success without one.")

# paper preview
py = cy + 164
rect(dx + 18, py, SW - 36, 380, bg=PAPER, stroke="#d5d9de")
rect(dx + 34, py + 16, 20, 20, bg=MINT, stroke="transparent")
text(dx + 62, py + 22, "SAFETYEYE · AUTOMATIC SAFETY RECORD", 8.5, "#5b6773")
text(dx + 34, py + 48, "Shift Safety Report", 19, "#101418")
text(dx + 34, py + 76, "Tower B — Level 4 · Sector 12 · 29 August 2026", 10, "#5b6773")
line(dx + 34, py + 96, dx + SW - 34, py + 96, stroke="#101418", sw=2)
text(dx + 34, py + 106, "PREVENTION", 9, "#5b6773")
for i, (k, v) in enumerate([("Warnings called out before a breach", "9"),
                            ("Breaches that still happened", "51"),
                            ("Incidents prevented", "44%")]):
    yy = py + 124 + i * 24
    text(dx + 34, yy, k, 10.5, "#101418")
    text(dx + SW - 60, yy, v, 10.5, "#101418")
    line(dx + 34, yy + 18, dx + SW - 34, yy + 18, stroke="#e8ebef")
text(dx + 34, py + 208, "WHAT HAPPENED", 9, "#5b6773")
for i in range(3):
    yy = py + 226 + i * 46
    rect(dx + 34, yy, 40, 40, bg="#dfe3e8", stroke="#cfd4da")
    text(dx + 40, yy + 16, "photo", 7, "#8a939c")
    text(dx + 84, yy + 6, ["Danger zone entered", "Warning called out", "Too many people"][i], 10, "#101418")
    text(dx + 84, yy + 22, "20:54:2" + str(i), 9, "#5b6773")
label(dx + SW + 30, py + 20,
      "The on-screen preview and the .docx\nare the same document. What the\nsupervisor reads here is what the\nclient receives.\n\n"
      "Photos: 256px square, placed at\n1.25in — about 205dpi on paper.")
tabbar(dx, dy + SH - 82, 3)

# ══════════════════════════════════════════════════════════════════════════
# 3 · component anatomy + states
# ══════════════════════════════════════════════════════════════════════════
CY = SCR_Y + 1300 + 260
heading(0, CY - 90, "3 · Components and their states", 24)
sub(0, CY - 58, "Every state a component actually reaches in the app. If it is not here, it does not exist.", 13)

def panel(x, y, w, h, title):
    rect(x, y, w, h, bg="#f6f7f9", stroke="#d9dde2")
    text(x + 14, y + 12, title, 13, INK)
    return x + 14, y + 40

# buttons
px, py_ = panel(0, CY, 320, 330, "Button")
button(px, py_, 270, "primary", "Start watching")
text(px, py_ + 54, "primary — mint gradient, #04120C text", 10, INK2)
button(px, py_ + 74, 270, "danger", "Stop watching")
text(px, py_ + 128, "danger — armed state, same position", 10, INK2)
button(px, py_ + 148, 270, "ghost", "Use the demo scene instead")
text(px, py_ + 202, "ghost — surface-2 + line-2 border", 10, INK2)
spec(px, py_ + 218, "15/18 pad · r15 · 14.5px/650\n:active scale(.965)")

# chips
px, py_ = panel(360, CY, 320, 330, "Chip / pill")
for i, (t, c) in enumerate([("2 of 3 on", MINT), ("Max 3", AMBER), ("On", RED), ("Set up", DIM), ("UNUSED", MINT)]):
    chip(px + (i % 3) * 92, py_ + (i // 3) * 36, t, c)
text(px, py_ + 84, "12% tint fill, 26–28% border, colour text", 10, INK2)
spec(px, py_ + 102, "5/10 pad · r999 · 10.5px/700")
text(px, py_ + 132, "HUD pill — over video, so it is opaque", 11, INK)
rect(px, py_ + 152, 130, 28, bg="#04070A", stroke=MINT)
ellipse(px + 10, py_ + 163, 7, 7, bg=MINT, stroke="transparent")
text(px + 24, py_ + 160, "WATCHING", 10, MINT)
rect(px + 142, py_ + 152, 118, 28, bg="#04070A", stroke=RED)
text(px + 152, py_ + 160, "BREACH", 10, RED)
spec(px, py_ + 190, "rgba(4,7,10,.76) + blur(14px)\nstates: idle amber · armed mint\n        alarm red · src muted")

# switch + stepper
px, py_ = panel(720, CY, 320, 330, "Switch · Stepper")
switch(px, py_, True); text(px + 60, py_ + 6, "on — mint track, knob right", 11, INK2)
switch(px, py_ + 40, False); text(px + 60, py_ + 46, "off — surface-2, knob dim", 11, INK2)
spec(px, py_ + 80, "46 x 27 · knob 19 · r999\nspring cubic-bezier(.34,1.4,.42,1)")
rect(px, py_ + 120, 96, 36, bg=SURF2, stroke=LINE2)
text(px + 10, py_ + 128, "–", 17, MUTED); text(px + 44, py_ + 128, "3", 16, TEXT, font=FONT_MONO)
text(px + 78, py_ + 128, "+", 17, MUTED)
spec(px, py_ + 166, "buttons 30 x 30 · r9 · value mono 16\nclamped 1–12 · :active scale(.86)")

# tile states
px, py_ = panel(1080, CY, 320, 330, "Tile")
tile(px, py_, 130, "BREACHES", "0")
tile(px + 140, py_, 130, "BREACHES", "51", hot=True, valcol=RED)
text(px, py_ + 110, "rest", 10, INK2); text(px + 140, py_ + 110, ".hot", 10, INK2)
spec(px, py_ + 130,
     "number mono 25px/700\n.bump on change — scale 1.2, 420ms\n.hot: red border tint + red number\nlabel 10px/700 .16em uppercase")

# toast
px, py_ = panel(1440, CY, 360, 330, "Toast")
rect(px, py_, 310, 62, bg=MINT, stroke="transparent")
rect(px + 12, py_ + 14, 34, 34, bg="#04120C", stroke="transparent", opacity=18)
text(px + 58, py_ + 12, "Danger zone set", 14, "#04120C")
text(px + 58, py_ + 34, "Now tap Start watching", 11, "#04120C")
rect(px, py_ + 76, 310, 62, bg=RED, stroke="transparent")
text(px + 58, py_ + 88, "Danger zone entered", 14, "#1a0505")
text(px + 58, py_ + 110, "1 person in the danger zone · 20:54", 11, "#1a0505")
spec(px, py_ + 150,
     "absolute · left/right 14 · top 56 + safe-area\nauto-dismiss 2800ms\nok = mint, otherwise red\nnever stacks — newest replaces")

# ══════════════════════════════════════════════════════════════════════════
# 4 · the overlay language
# ══════════════════════════════════════════════════════════════════════════
OY = CY + 300
heading(0, OY, "4 · The overlay — the part that has to be unmistakable across a site", 22)
sub(0, OY + 32, "Drawn on a canvas over the video at 60fps. This is what a supervisor reads from three metres away.", 13)

ox_, oy_ = 0, OY + 64
rect(ox_, oy_, 560, 380, bg="#0C1218", stroke=LINE2)
rect(ox_ + 260, oy_ + 60, 240, 220, bg=RED, stroke=RED, ss="dashed", sw=2, opacity=12)
rect(ox_ + 260, oy_ + 44, 104, 16, bg=RED, stroke="transparent")
text(ox_ + 266, oy_ + 46, "DANGER ZONE", 9, "#04070A")
rect(ox_ + 60, oy_ + 150, 70, 170, bg="transparent", stroke=MINT, sw=1.6)
for (cx_, cy_) in [(60, 150), (130, 150), (60, 320), (130, 320)]:
    line(ox_ + cx_, oy_ + cy_, ox_ + cx_ + (13 if cx_ == 60 else -13), oy_ + cy_, stroke=MINT, sw=2.6)
    line(ox_ + cx_, oy_ + cy_, ox_ + cx_, oy_ + cy_ + (13 if cy_ == 150 else -13), stroke=MINT, sw=2.6)
rect(ox_ + 60, oy_ + 134, 74, 15, bg=MINT, stroke="transparent")
text(ox_ + 64, oy_ + 135, "person 93%", 8, "#04070A")
rect(ox_ + 300, oy_ + 150, 70, 170, bg="transparent", stroke=RED, sw=2.4)
rect(ox_ + 300, oy_ + 134, 74, 15, bg=RED, stroke="transparent")
text(ox_ + 304, oy_ + 135, "person 91%", 8, "#04070A")
arrow(ox_ + 140, oy_ + 235, ox_ + 250, oy_ + 235, stroke=MINT, sw=2)
text(ox_ + 150, oy_ + 212, "projected 0.75s ahead", 10, MINT)

label(600, OY + 70,
      "Zone\n"
      "  dashed 2px, 7/5 dash, 12% fill\n"
      "  label tag sits above, clamped inside the frame\n"
      "  red = danger zone · blue = fire exit\n")
label(600, OY + 160,
      "Detection box\n"
      "  1.5px normally, 2.4px when inside a zone\n"
      "  corner ticks at min(13, 28% of the side)\n"
      "  mint = person outside · red = person inside\n"
      "  grey = object · blue = object in the fire exit\n"
      "  fades to 25% as a track goes unmatched")
label(600, OY + 290,
      "Prediction\n"
      "  the arrow is conceptual — not drawn today.\n"
      "  Worth designing: it is the one thing on screen\n"
      "  that shows this system is preventive, and right\n"
      "  now a judge has to be told rather than shown.")
spec(600, OY + 372, "flash: inset 0 0 0 3px red + inset 0 0 70px rgba(255,90,90,.4)\nwarn flash is amber and shorter (600ms vs 700ms)")

# ══════════════════════════════════════════════════════════════════════════
# 5 · what to fix
# ══════════════════════════════════════════════════════════════════════════
FY = OY + 500
heading(0, FY, "5 · Known weak points — worth a designer's attention", 22)
notes = [
    ("Overlay vs video crop", "The video is object-fit: cover but the overlay canvas maps 0–1 across the full\n"
                              "stage. When the camera aspect differs from the stage, boxes sit slightly off\n"
                              "the person and a drawn zone is not quite where the detector thinks it is."),
    ("Density on small screens", "At 360x640 the Site tab is a long scroll of eight cards. The six tiles and the\n"
                                 "prevention card say overlapping things. There is a tighter summary in here."),
    ("The stage is too small", "The camera preview is the product and it currently gets 300px of a 812px screen,\n"
                               "with the primary action below the fold on short phones."),
    ("No empty states drawn", "Alerts and Report before anything happens. First-run is what a judge sees first."),
    ("Numbers without meaning", "'51 breaches' reads as failure. The prevention card fixes the framing but only\n"
                                "appears lower down; the tiles lead with the bad number."),
    ("Google Fonts over the network", "index.html still links fonts.googleapis.com. In aeroplane mode — the whole demo —\n"
                                      "it silently falls back. Inter should be vendored locally."),
]
for i, (t, d) in enumerate(notes):
    yy = FY + 44 + i * 100
    rect(0, yy, 940, 86, bg="#fff8e8", stroke="#e0c58a")
    text(14, yy + 12, t, 13, "#7a5200")
    text(14, yy + 32, d, 11, "#5b5b5b")

doc = {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": E,
    "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
    "files": {},
}
out = os.path.join("docs", "safetyeye-ui.excalidraw")
io.open(out, "w", encoding="utf-8").write(json.dumps(doc, indent=1))
print("wrote", out, len(E), "elements")
