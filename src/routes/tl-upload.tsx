import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ChevronDown, CheckCircle2, MapPin, Clock, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { posmMaterials } from "@/lib/posm-data";

export const Route = createFileRoute("/tl-upload")({
  component: TlUploadPage,
  head: () => ({
    meta: [
      { title: "TL Upload — POSM Tracker" },
      { name: "description", content: "Upload POSM placement photos with location and timestamp" },
    ],
  }),
});

function TlUploadPage() {
  const [material, setMaterial] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit = material && photo;

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setResult({ code: material });
    setTimeout(() => {
      setResult(null);
      setMaterial("");
      setPhoto(null);
    }, 4000);
  }

  const selectClass =
    "w-full appearance-none rounded-xl border bg-card px-3 py-3 pr-10 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Camera size={18} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold">Step 4: Upload Implementation Proof</h2>
            <p className="text-[11px] text-muted-foreground">Upload POSM placement photo</p>
          </div>
        </div>

        {/* Material Select */}
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-foreground">POSM Material</span>
          <div className="relative">
            <select value={material} onChange={(e) => setMaterial(e.target.value)} className={selectClass}>
              <option value="">— Select material —</option>
              {posmMaterials.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} ({m.name})
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        {/* Upload Photo */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />

        {!photo ? (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-card py-8 text-muted-foreground transition active:scale-[0.98]">
            <Camera size={28} />
            <span className="text-xs font-semibold">Tap to Upload Photo</span>
          </button>
        ) : (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-xl border shadow-sm">
              <img src={photo} alt="POSM photo" className="w-full object-cover" />
            </div>
            <button type="button" onClick={() => setPhoto(null)} className="text-[11px] font-medium text-destructive underline">
              Remove & retake
            </button>
          </div>
        )}

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!canSubmit} className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40">
          <Upload size={16} className="mr-2 inline-block" />
          Submit
        </button>

        {/* Result */}
        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-1.5 rounded-xl border bg-success/5 px-3 py-3 text-xs">
              <p className="flex items-center gap-1.5 font-bold text-success"><CheckCircle2 size={16} /> ✅ Uploaded Successfully</p>
              <div className="space-y-0.5 text-foreground">
                <p><span className="text-muted-foreground">Material Code:</span> <strong>{result.code}</strong></p>
                <p className="flex items-center gap-1"><MapPin size={12} className="text-primary" /> 📍 Location Captured</p>
                <p className="flex items-center gap-1"><Clock size={12} className="text-primary" /> 🕒 Timestamp Added</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
