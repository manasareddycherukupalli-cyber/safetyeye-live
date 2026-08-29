// supervisor.js — the second phone's screen.
//
// It holds no camera and no model. It polls server/relay.py through mesh.js and
// renders what every site phone has already decided. The tallies come from
// SafetyEyeReport.summarize(), the same function the shift report uses, so the
// live numbers and the printed report can never disagree.

const relayInput = document.getElementById('relayUrl');
const connectBtn = document.getElementById('connectBtn');
const connText = document.getElementById('connText');
const dot = document.querySelector('#conn .dot');
const feed = document.getElementById('feed');
const zoneRows = document.getElementById('zoneRows');

const events = [];
const MAX_FEED_ROWS = 40;

relayInput.value = Mesh.state().relayUrl;

function timeOf(ts) {
  return new Date(ts || Date.now()).toLocaleTimeString('en-GB');
}

function renderTotals() {
  const summary = SafetyEyeReport.summarize(events);
  document.getElementById('tWarn').textContent = summary.totalWarnings;
  document.getElementById('tBreach').textContent = summary.totalBreaches;
  document.getElementById('tPrevented').textContent = `${summary.preventedPct}%`;

  const rows = Object.entries(summary.byZone)
    .sort((a, b) => (b[1].breaches - a[1].breaches) || (b[1].warnings - a[1].warnings))
    .map(([zone, c]) => `<tr><td>${zone}</td><td>${c.warnings}</td><td>${c.breaches}</td></tr>`)
    .join('');
  zoneRows.innerHTML = rows || '<tr><td colspan="3">waiting for events…</td></tr>';
}

function renderEvent(event) {
  const li = document.createElement('li');
  li.className = event.status === 'breach' ? 'breach' : 'warn';

  const line = document.createElement('div');
  line.textContent = `${(event.status || '').toUpperCase()} — ${event.rule?.zone || 'unknown'}: ${event.say || ''}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${timeOf(event.ts)} · ${event.device || 'unknown phone'} · #${event.seq}`;

  li.append(line, meta);
  feed.prepend(li);
  while (feed.children.length > MAX_FEED_ROWS) feed.lastElementChild.remove();
}

// textContent everywhere above, never innerHTML: a `say` string is written by
// the model on another phone, and it lands here as text, not as markup.
Mesh.on('event', (event) => {
  events.push(event);
  renderEvent(event);
  renderTotals();
});

Mesh.on('status', (status) => {
  if (!status.connected) {
    dot.className = 'dot';
    connText.textContent = 'not connected';
    connectBtn.textContent = 'Connect';
    return;
  }
  connectBtn.textContent = 'Disconnect';
  if (status.reachable === false) {
    dot.className = 'dot down';
    connText.textContent = `relay unreachable — retrying (${status.error || 'no response'})`;
  } else {
    dot.className = 'dot live';
    connText.textContent = `live · ${status.relayUrl} · ${events.length} events`;
  }
});

connectBtn.addEventListener('click', () => {
  if (Mesh.state().connected) {
    Mesh.stop();
    return;
  }
  const url = relayInput.value.trim();
  if (!url) {
    connText.textContent = 'enter the relay address first';
    return;
  }
  Mesh.configure({ relayUrl: url, device: 'supervisor' });
  relayInput.value = Mesh.state().relayUrl;
  // Joining late should still show the shift so far, not only what happens next.
  Mesh.rewind();
  events.length = 0;
  feed.innerHTML = '';
  Mesh.start();
});

// Reconnect on load if a relay was used before — the phone gets locked and
// unlocked plenty during a demo, and nobody should retype an IP each time.
if (Mesh.state().relayUrl) connectBtn.click();
