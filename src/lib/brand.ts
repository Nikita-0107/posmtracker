// Brand inference from material name. Materials don't carry an explicit
// brand column, so we derive one from the start of the human-readable name.
// Order matters: more specific patterns first.
const BRAND_RULES: { match: RegExp; brand: string }[] = [
  { match: /^duke\b/i, brand: "Duke" },
  { match: /^berkeley\b/i, brand: "Berkeley" },
  { match: /^players\b/i, brand: "Players" },
  { match: /^gold\s*flake\s*kings?\b/i, brand: "GFK" },
  { match: /^gfk\b/i, brand: "GFK" },
  { match: /^gold\s*flake\b/i, brand: "Gold Flake" },
  { match: /^gf\b/i, brand: "Gold Flake" },
  { match: /^ac\s+farlongs?\b/i, brand: "AC Farlongs" },
  { match: /^classic\b/i, brand: "Classic" },
  { match: /^cl\b/i, brand: "Classic" },
  { match: /^rwb\b/i, brand: "RWB" },
  { match: /^maroon\s*red\b/i, brand: "Maroon Red" },
  { match: /^navy\s*cut\b/i, brand: "Navy Cut" },
  { match: /^scissors\b/i, brand: "Scissors" },
  { match: /^capstan\b/i, brand: "Capstan" },
  { match: /^bristol\b/i, brand: "Bristol" },
  { match: /^insignia\b/i, brand: "Insignia" },
  { match: /^american\s*club\b/i, brand: "American Club" },
];

export function brandFromName(name: string | null | undefined): string {
  if (!name) return "Other";
  for (const rule of BRAND_RULES) {
    if (rule.match.test(name)) return rule.brand;
  }
  // Fallback: first word, capitalised
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first) return "Other";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export const VERIFY_INTERVAL_DAYS = 7;

export function verifyStatus(lastDateIso: string | null): {
  status: "overdue" | "due_soon" | "ok" | "never";
  daysSince: number | null;
  daysUntilDue: number | null;
} {
  if (!lastDateIso) return { status: "never", daysSince: null, daysUntilDue: null };
  const last = new Date(lastDateIso);
  if (Number.isNaN(last.getTime()))
    return { status: "never", daysSince: null, daysUntilDue: null };
  const days = Math.floor((Date.now() - last.getTime()) / 86400000);
  const until = VERIFY_INTERVAL_DAYS - days;
  if (days >= VERIFY_INTERVAL_DAYS)
    return { status: "overdue", daysSince: days, daysUntilDue: until };
  if (until <= 3) return { status: "due_soon", daysSince: days, daysUntilDue: until };
  return { status: "ok", daysSince: days, daysUntilDue: until };
}
