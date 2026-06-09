import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, Search, Package } from "lucide-react";
import { AppShell } from "@/components/AppShell";

import cbo from "@/assets/posm-guide/cbo.jpg.asset.json";
import honeycomb from "@/assets/posm-guide/honeycomb.jpg.asset.json";
import fabrics from "@/assets/posm-guide/fabrics.jpg.asset.json";
import a4Stickers from "@/assets/posm-guide/a4-stickers.jpg.asset.json";
import shelfHighlighters from "@/assets/posm-guide/shelf-highlighters.jpg.asset.json";
import brandBoards from "@/assets/posm-guide/brand-boards.jpg.asset.json";
import slu from "@/assets/posm-guide/slu.jpg.asset.json";
import dummyPackets from "@/assets/posm-guide/dummy-packets.jpg.asset.json";
import danglers from "@/assets/posm-guide/danglers.jpg.asset.json";
import ibb from "@/assets/posm-guide/ibb.jpg.asset.json";
import backingSheets from "@/assets/posm-guide/backing-sheets.jpg.asset.json";
import horizontalCeiling from "@/assets/posm-guide/horizontal-ceiling.jpg.asset.json";
import verticalCeiling from "@/assets/posm-guide/vertical-ceiling.jpg.asset.json";
import kappaUnits from "@/assets/posm-guide/kappa-units.jpg.asset.json";
import counterTops from "@/assets/posm-guide/counter-tops.jpg.asset.json";

export const Route = createFileRoute("/posm-guide")({
  component: PosmGuidePage,
  head: () => ({ meta: [{ title: "POSM Guide — POSM Tracker" }] }),
});

type Item = {
  name: string;
  image?: string;
  codes: string[];
  short: string;
  description: string;
  keywords?: string[];
};

const items: Item[] = [
  {
    name: "CBOs",
    image: cbo.url,
    codes: ["BOXSOL"],
    short: "Dummy outer for backwalls and Fab PDU units.",
    description:
      "Dummy outer placed in Backwalls and Fab PDU units to ensure planogramming and enhance visibility.",
  },
  {
    name: "Honeycomb",
    image: honeycomb.url,
    codes: ["HCOMB"],
    short: "Lightweight promotional display unit for campaigns.",
    description:
      "Lightweight promotional display unit used for campaign communication and outlet branding. Commonly placed in visible areas to attract consumer attention.",
    keywords: ["honey comb"],
  },
  {
    name: "Fabrics",
    image: fabrics.url,
    codes: ["FAB"],
    short: "Fabric display placed on backwalls and Fab PDUs.",
    description:
      "Placed on Backwalls and Fab PDU units to enhance visibility and ensure in-store execution aligns with brand objectives such as new launches and planogramming.",
  },
  {
    name: "A4 Stickers",
    image: a4Stickers.url,
    codes: ["PG_BB_8X11IN"],
    short: "Small branding stickers for shelves and counters.",
    description:
      "Small branding stickers used on shelves, counters, and other outlet surfaces to improve product and brand visibility.",
    keywords: ["pg board", "8x11"],
  },
  {
    name: "Shelf Highlighters",
    image: shelfHighlighters.url,
    codes: ["SHELF"],
    short: "Branding strips attached to shelves.",
    description:
      "Branding strips attached to shelves to highlight products and improve visibility at the point of sale.",
    keywords: ["shelf strip"],
  },
  {
    name: "Brand Boards",
    image: brandBoards.url,
    codes: ["ALT_PP_BB", "PG_BB"],
    short: "Promotional boards displayed on counters.",
    description:
      "Promotional boards displayed on counters to improve brand visibility and communication.",
    keywords: ["alt pp", "brand"],
  },
  {
    name: "SLU",
    image: slu.url,
    codes: ["SLU"],
    short: "Sequential Lit Units for new launches.",
    description:
      "Sequential Lit Units — lit display elements deployed during new product launches to enhance visibility and attract consumer attention.",
    keywords: ["sequential lit unit", "self loading"],
  },
  {
    name: "Kappa Units",
    image: kappaUnits.url,
    codes: ["KAPPA"],
    short: "Kappa display unit.",
    description: "Kappa display unit used for in-shop branding and visibility.",
  },
  {
    name: "Dummy Packets",
    image: dummyPackets.url,
    codes: ["BSS"],
    short: "Display-only packets to improve visibility.",
    description:
      "Packets used only for display purposes and not for sale. Used to improve brand visibility within POSM units.",
    keywords: ["dummy"],
  },
  {
    name: "Danglers",
    image: danglers.url,
    codes: ["DANGL"],
    short: "Promotional materials hung from ceilings or shelves.",
    description:
      "Promotional materials suspended from ceilings or shelves to improve in-shop visibility.",
    keywords: ["dangle"],
  },
  {
    name: "IBB",
    image: ibb.url,
    codes: ["IBB", "IU_ALT_PP"],
    short: "Integrated Brand Boards for neutral outlets.",
    description:
      "Integrated Brand Boards combining a backing sheet and brand board. Used at neutral outlets to enhance counter visibility.",
    keywords: ["ribb"],
  },
  {
    name: "Backing Sheets",
    image: backingSheets.url,
    codes: ["BS"],
    short: "Designed sheets used with Brand Boards.",
    description:
      "Brand-designed sheets used along with Brand Boards for counter visibility.",
    keywords: ["rwb", "backing"],
  },
  {
    name: "Counter Tops",
    codes: ["CTU"],
    short: "Counter Top Unit for in-shop branding.",
    description: "Counter Top Unit placed on outlet counters for brand visibility.",
    keywords: ["counter"],
  },
  {
    name: "Horizontal Ceiling in Shop",
    image: horizontalCeiling.url,
    codes: ["HORI_CIS"],
    short: "Horizontal branding material from the ceiling.",
    description:
      "Branding material suspended horizontally from the ceiling to improve outlet visibility.",
    keywords: ["horizontal", "cis"],
  },
  {
    name: "Vertical Ceiling in Shop",
    image: verticalCeiling.url,
    codes: ["VER_CIS"],
    short: "Vertical branding material from the ceiling.",
    description:
      "Branding material suspended vertically from the ceiling to maximize visibility from different viewing angles.",
    keywords: ["vertical", "cis"],
  },
];

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function PosmGuidePage() {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return items;
    const tokens = q.split(" ").filter(Boolean);
    return items.filter((it) => {
      const hay = normalize(
        [it.name, it.short, it.description, ...it.codes, ...(it.keywords ?? [])].join(" "),
      );
      return tokens.every((t) => hay.includes(t));
    });
  }, [query]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="text-primary" size={20} />
          <h1 className="font-heading text-lg font-bold text-foreground">POSM Reference Guide</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Visual reference of POSM materials with their system codes. Tap a card to read more.
        </p>

        <div className="sticky top-[52px] z-10 -mx-3 bg-background/95 px-3 py-2 backdrop-blur">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or code (e.g. Honeycomb, BOXSOL, IBB)…"
              className="h-11 w-full rounded-xl border border-muted-foreground/20 bg-card pl-10 pr-3 text-sm shadow-sm outline-none focus:border-primary"
              autoComplete="off"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
            No materials match “{query}”.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filtered.map((it) => {
              const isOpen = expanded === it.name;
              return (
                <button
                  key={it.name}
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : it.name)}
                  className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted">
                    {it.image ? (
                      <img
                        src={it.image}
                        alt={it.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <Package className="text-muted-foreground/40" size={48} />
                    )}
                  </div>
                  <div className="space-y-1.5 p-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="font-heading text-sm font-bold text-foreground">{it.name}</p>
                      <div className="flex flex-wrap gap-1">
                        {it.codes.map((code) => (
                          <span
                            key={code}
                            className="rounded-md border border-primary/30 bg-primary/15 px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-primary"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {isOpen ? it.description : it.short}
                    </p>
                    <p className="pt-1 text-[10px] font-semibold text-primary">
                      {isOpen ? "Show less ▲" : "Read more ▼"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="pb-6 pt-2 text-center text-[10px] text-muted-foreground">
          Showing {filtered.length} of {items.length} materials
        </p>
      </div>
    </AppShell>
  );
}
