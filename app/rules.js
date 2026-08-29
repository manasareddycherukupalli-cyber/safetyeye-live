// Zone geometry and rule evaluation: zone_intrusion, occupancy, obstruction, proximity.
// Rules follow the schema from CLAUDE.md:
//   { type, zone, limit, severity: 'warn'|'critical', say }
// Zones are rectangles in video-pixel coordinates: { x, y, w, h }.
// Exposes window.SafetyEyeRules = { RuleEngine, pointInRect }

function pointInRect([px, py], rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

function distance([ax, ay], [bx, by]) {
  return Math.hypot(ax - bx, ay - by);
}

// Shortest distance from a point to a rectangle (0 when inside). Distance to the
// zone's centre is the wrong measure — a wide zone would let you stand on its edge
// and still be counted as "far away".
function distanceToRect([px, py], r) {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

class RuleEngine {
  constructor() {
    this.zones = new Map(); // name -> rect
    this.rules = [];
    this.proximityMarginPx = 140; // replaced once the frame size is known
  }

  // A proximity rule means "do not get close to this". Close has to be in pixels,
  // but the model gives us `limit` in metres or people — it cannot know the camera's
  // scale, and we have no calibration to convert one to the other. So the margin is
  // derived from the frame instead: ~12% of the diagonal, which on a propped phone
  // is roughly an arm's length at working distance. Honest, and stable across
  // resolutions.
  setFrameSize(w, h) {
    if (w > 0 && h > 0) this.proximityMarginPx = Math.hypot(w, h) * 0.12;
  }

  setZone(name, rect) {
    this.zones.set(name, rect);
  }

  removeZone(name) {
    this.zones.delete(name);
  }

  setRules(rules) {
    this.rules = rules;
  }

  addRule(rule) {
    this.rules.push(rule);
  }

  // tracks: output of Tracker.update() — [{id, class, bbox, center, predictedCenter}]
  // Returns events: { status: 'warn'|'breach', rule, trackIds, say }
  evaluate(tracks) {
    const events = [];

    for (const rule of this.rules) {
      const zoneRect = this.zones.get(rule.zone);
      if (!zoneRect) continue;

      if (rule.type === 'zone_intrusion') {
        for (const t of tracks) {
          if (pointInRect(t.center, zoneRect)) {
            events.push({ status: 'breach', rule, trackIds: [t.id], say: rule.say });
          } else if (pointInRect(t.predictedCenter, zoneRect)) {
            events.push({ status: 'warn', rule, trackIds: [t.id], say: rule.say });
          }
        }
      }

      if (rule.type === 'occupancy') {
        const occupants = tracks.filter((t) => t.class === 'person' && pointInRect(t.center, zoneRect));
        if (occupants.length > rule.limit) {
          events.push({
            status: rule.severity === 'critical' ? 'breach' : 'warn',
            rule,
            trackIds: occupants.map((o) => o.id),
            say: rule.say,
          });
        }
      }

      if (rule.type === 'obstruction') {
        // Anything sitting in the zone counts (e.g. equipment left blocking an exit),
        // not just people.
        const blockers = tracks.filter((t) => pointInRect(t.center, zoneRect));
        if (blockers.length > 0) {
          events.push({
            status: rule.severity === 'critical' ? 'breach' : 'warn',
            rule,
            trackIds: blockers.map((b) => b.id),
            say: rule.say,
          });
        }
      }

      if (rule.type === 'proximity') {
        // Measured to the zone's edge, not its centre. `rule.limit` is deliberately
        // ignored here — see setFrameSize().
        const margin = this.proximityMarginPx;
        for (const t of tracks) {
          if (t.class !== 'person') continue; // a mouse is not approaching anything
          const currentDist = distanceToRect(t.center, zoneRect);
          const predictedDist = distanceToRect(t.predictedCenter, zoneRect);
          if (currentDist < margin) {
            events.push({ status: 'breach', rule, trackIds: [t.id], say: rule.say });
          } else if (predictedDist < margin) {
            events.push({ status: 'warn', rule, trackIds: [t.id], say: rule.say });
          }
        }
      }
    }

    return events;
  }
}

window.SafetyEyeRules = { RuleEngine, pointInRect, distance, distanceToRect };
