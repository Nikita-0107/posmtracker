"use client";

import { useState, useMemo } from "react";
import { BookOpen, X, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";

export interface MaterialRef {
  type: string;
  description: string;
  codes: string[];
  synonyms?: string[];
}

export const posmReferenceData: MaterialRef[] = [
  { type: "CBOs", description: "CBOs", codes: ["BOXSOL"] },
  { type: "Honeycomb", description: "Honeycomb Board", codes: ["HCOMB"], synonyms: ["honey comb"] },
  { type: "Fabrics", description: "Fabric Display / Board", codes: ["FAB"] },
  { type: "A4 Stickers", description: "A4 Sticker / PG Board 8x11in", codes: ["PG_BB_8X11IN"], synonyms: ["pg board", "8x11"] },
  { type: "Shelf Highlighters", description: "Shelf Strip / Highlighter", codes: ["SHELF"], synonyms: ["shelf strip"] },
  { type: "Brand Boards", description: "Brand Board (Alternate PP / PG)", codes: ["ALT_PP_BB", "PG_BB"], synonyms: ["alt pp", "brand"] },
  { type: "SLU", description: "Self Loading Unit / SLU", codes: ["SLU"], synonyms: ["self loading"] },
  { type: "Kappa Units", description: "Kappa Display Unit", codes: ["KAPPA"] },
  { type: "Dummy Packets", description: "Dummy / BSS Packet", codes: ["BSS"], synonyms: ["dummy"] },
  { type: "Danglers", description: "Dangler / Hanging Display", codes: ["DANGL"], synonyms: ["dangle"] },
  { type: "RIBB", description: "RIBB / IBB / IU_ALT_PP", codes: ["IBB", "IU_ALT_PP"], synonyms: ["ribb"] },
  { type: "Backing Sheets", description: "Backing / RWB Sheet", codes: ["BS"], synonyms: ["rwb", "backing"] },
  { type: "Counter Tops", description: "Counter Top Unit", codes: ["CTU"], synonyms: ["counter"] },
  { type: "Horizontal Ceiling in Shop", description: "Horizontal Ceiling in Shop", codes: ["HORI_CIS", "HORI CIS"], synonyms: ["horizontal", "cis"] },
  { type: "Vertical Ceiling in Shop", description: "Vertical Ceiling in Shop", codes: ["VER_CIS", "VER CIS"], synonyms: ["vertical", "cis"] },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matches(query: string, ref: MaterialRef): boolean {
  const q = normalize(query);
  if (!q) return true;
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const hay = normalize(
    [ref.type, ref.description, ...ref.codes, ...(ref.synonyms ?? [])].join(" ")
  );
  return tokens.every((t) => hay.includes(t));
}

export function PosmReferenceGuide({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return posmReferenceData;
    return posmReferenceData.filter((r) => matches(q, r));
  }, [query]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-muted-foreground/20 bg-card px-2 py-1.5 text-[10px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="POSM Material Reference"
          title="POSM Material Reference"
        >
          <BookOpen size={14} />
          {!compact && <span className="hidden sm:inline">Reference</span>}
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80dvh] sm:h-auto sm:max-h-[600px] rounded-t-2xl p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle className="text-base">POSM Material Reference</SheetTitle>
                <SheetDescription className="text-[11px]">
                  Quick guide to material types and their codes
                </SheetDescription>
              </div>
              <SheetClose asChild>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </SheetClose>
            </div>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or code…"
                className="h-9 rounded-lg border-muted-foreground/20 bg-muted/40 pl-9 text-sm placeholder:text-muted-foreground/60"
                autoComplete="off"
              />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No materials match "{query}"
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((ref) => (
                  <div
                    key={ref.type}
                    className="rounded-xl border bg-card p-3 shadow-sm transition hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground">{ref.type}</p>
                        <p className="text-[11px] text-muted-foreground">{ref.description}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {ref.codes.map((code) => (
                          <span
                            key={code}
                            className="shrink-0 rounded-md bg-primary/15 px-2.5 py-1 font-mono text-sm font-bold text-primary"
                          >
                            {code}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t bg-muted/30 px-4 py-2 text-center text-[10px] text-muted-foreground">
            {filtered.length} of {posmReferenceData.length} materials shown
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
