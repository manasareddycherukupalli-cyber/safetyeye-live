// End-of-shift report: summarizes logged events and blurs any stored frame
// before it's shown, on-device.
//
// Anonymisation blurs the WHOLE frame, not just detected faces — masking
// only detections would make anonymity depend on the detector succeeding,
// and it misses constantly. This fails closed instead (see CLAUDE.md).

function summarize(events) {
  const warnings = events.filter((e) => e.status === 'warn');
  const breaches = events.filter((e) => e.status === 'breach');
  // A breach only happens when a warning failed to stop the crossing, so a
  // warning that never became a breach is a prevented incident.
  const prevented = Math.max(0, warnings.length - breaches.length);
  const preventedPct = warnings.length > 0 ? Math.round((prevented / warnings.length) * 100) : 0;

  const byZone = {};
  for (const e of events) {
    const zone = e.rule?.zone ?? 'unknown';
    byZone[zone] = byZone[zone] || { warnings: 0, breaches: 0 };
    if (e.status === 'warn') byZone[zone].warnings += 1;
    if (e.status === 'breach') byZone[zone].breaches += 1;
  }

  return {
    totalWarnings: warnings.length,
    totalBreaches: breaches.length,
    prevented,
    preventedPct,
    byZone,
    breachEvents: breaches,
  };
}

// Draws the current video frame to an offscreen canvas with a strong blur
// applied to the entire image, then returns it as a data URL. Always blurs
// the whole frame — never just a detected region.
function captureBlurredFrame(video, blurPx = 24) {
  const off = document.createElement('canvas');
  off.width = video.videoWidth || 640;
  off.height = video.videoHeight || 480;
  const octx = off.getContext('2d');
  octx.filter = `blur(${blurPx}px)`;
  octx.drawImage(video, 0, 0, off.width, off.height);
  return off.toDataURL('image/jpeg', 0.7);
}

function renderReportHtml(summary) {
  const zoneRows = Object.entries(summary.byZone)
    .map(([zone, c]) => `<tr><td>${zone}</td><td>${c.warnings}</td><td>${c.breaches}</td></tr>`)
    .join('');

  const snapshots = summary.breachEvents
    .filter((e) => e.snapshot)
    .map((e) => `<img src="${e.snapshot}" style="width:120px;border-radius:6px;margin:4px;">`)
    .join('');

  return `
    <h2>Shift Report</h2>
    <p style="font-size:18px;">
      <strong>${summary.totalWarnings}</strong> warnings,
      <strong>${summary.totalBreaches}</strong> breaches,
      <strong>${summary.preventedPct}% prevented</strong>
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr><th align="left">Zone</th><th>Warnings</th><th>Breaches</th></tr>
      ${zoneRows || '<tr><td colspan="3">No events yet</td></tr>'}
    </table>
    <p>Breach snapshots (blurred):</p>
    <div>${snapshots || 'None'}</div>
  `;
}

window.SafetyEyeReport = { summarize, captureBlurredFrame, renderReportHtml };
