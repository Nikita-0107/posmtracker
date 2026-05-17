// Fuzzy / shorthand search for materials and operational fields.
//
// Goals:
// - Case-insensitive, ignores punctuation and separators.
// - Multi-keyword: every whitespace-separated token must match (order-agnostic).
// - Brand & shorthand aliases so "GFK", "Goldflake", "Gold Flake" all match,
//   "HCOMB" matches "Honeycomb", etc.
// - Tolerates partial words ("alt" matches "ALTERNATE").
// - Works on any number of text fields (code + name + extras).

// Synonym groups — any term in a group expands to ALL terms in the group on
// both the query side and the target side, so a hit on either form succeeds.
const SYNONYM_GROUPS: string[][] = [
  ["gfk", "goldflake", "gold flake", "gold flake kings", "gf"],
  ["hcomb", "honeycomb", "honey comb"],
  ["cl", "classic"],
  ["rwb", "red white blue"],
  ["bb", "bill board", "billboard"],
  ["alt", "alternate", "alternative"],
  ["fsu", "free standing unit"],
  ["ac", "american club"],
  ["nc", "navy cut"],
  ["dp", "dangler", "danglers"],
  ["std", "standee", "standees"],
  ["pstr", "poster", "posters"],
  ["lb", "light box", "lightbox"],
  ["sb", "sign board", "signboard"],
  ["wsp", "wholesale point"],
  ["wd", "wholesale distributor", "distributor"],
  ["tl", "team lead"],
  ["po", "purchase order"],
];

// Build a lookup: normalized term -> full expansion string with all variants.
const EXPANSIONS: Array<{ re: RegExp; rep: string }> = SYNONYM_GROUPS.map(
  (group) => {
    const escaped = group
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"))
      .join("|");
    const rep = " " + group.join(" ") + " ";
    return { re: new RegExp(`\\b(?:${escaped})\\b`, "gi"), rep };
  },
);

function expand(s: string): string {
  let out = " " + s + " ";
  for (const { re, rep } of EXPANSIONS) out = out.replace(re, rep);
  return out;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if every whitespace-separated token in `query` appears
 * somewhere in the concatenated, alias-expanded `fields`. Punctuation,
 * spacing and case are ignored. Falsy / empty query returns true.
 */
export function matchesSearch(
  query: string | null | undefined,
  ...fields: Array<string | number | null | undefined>
): boolean {
  const q = (query ?? "").trim();
  if (!q) return true;
  const joined = fields
    .filter((f) => f !== null && f !== undefined && f !== "")
    .map((f) => String(f))
    .join(" ");
  const hay = normalize(expand(joined));
  const hayNoSpace = hay.replace(/\s+/g, "");
  const tokens = normalize(expand(q)).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((t) => hay.includes(t) || hayNoSpace.includes(t));
}
