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

class RuleEngine {
  constructor() {
    this.zones = new Map(); // name -> rect
    this.rules = [];
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
        // limit = minimum allowed distance (px) from the zone's center point.
        const zoneCenter = [zoneRect.x + zoneRect.w / 2, zoneRect.y + zoneRect.h / 2];
        for (const t of tracks) {
          const currentDist = distance(t.center, zoneCenter);
          const predictedDist = distance(t.predictedCenter, zoneCenter);
          if (currentDist < rule.limit) {
            events.push({ status: 'breach', rule, trackIds: [t.id], say: rule.say });
          } else if (predictedDist < rule.limit) {
            events.push({ status: 'warn', rule, trackIds: [t.id], say: rule.say });
          }
        }
      }
    }

    return events;
  }
}

window.SafetyEyeRules = { RuleEngine, pointInRect, distance };
