import { ChevronDown, Building2 } from "lucide-react";
import { useWsp, WSP_OPTIONS, type Wsp } from "@/hooks/use-wsp";

export function WspSelector({ compact = false }: { compact?: boolean }) {
  const [wsp, setWsp] = useWsp();

  if (compact) {
    return (
      <div className="relative">
        <Building2
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-primary"
        />
        <select
          value={wsp}
          onChange={(e) => setWsp(e.target.value as Wsp)}
          className="appearance-none rounded-lg border border-primary/30 bg-primary/5 py-1 pl-6 pr-6 text-[11px] font-bold text-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          aria-label="Select WSP"
        >
          {WSP_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-primary"
        />
      </div>
    );
  }

  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-foreground">Select WSP</span>
      <div className="relative">
        <Building2
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <select
          value={wsp}
          onChange={(e) => setWsp(e.target.value as Wsp)}
          className="w-full appearance-none rounded-xl border bg-card py-3 pl-9 pr-10 text-sm font-bold text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          {WSP_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </label>
  );
}

export function WspBadge() {
  const [wsp] = useWsp();
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Building2 size={10} /> {wsp}
    </span>
  );
}
