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
  const [success, setSuccess] = useState(false);
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
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setMaterial("");
      setPhoto(null);
    }, 3000);
  }

  const now = new Date();

  return (
    <AppShell>
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Camera size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold">TL Upload</h2>
            <p className="text-xs text-muted-foreground">Upload POSM placement photo</p>
          </div>
        </div>

        {/* Material Select */}
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-foreground">Select POSM Material</span>
          <div className="relative">
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="w-full appearance-none rounded-xl border bg-card px-4 py-3.5 pr-10 text-sm font-medium text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
            >
              <option value="">— Choose material —</option>
              {posmMaterials.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </label>

        {/* Upload Photo */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhoto}
          className="hidden"
        />

        {!photo ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/30 bg-card py-10 text-muted-foreground transition active:scale-[0.98]"
          >
            <Camera size={32} />
            <span className="text-sm font-semibold">Tap to Upload Photo</span>
          </button>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border shadow-sm">
              <img src={photo} alt="POSM photo" className="w-full object-cover" />
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5">
                <MapPin size={14} className="text-primary" /> 📍 Location captured
              </span>
              <span className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5">
                <Clock size={14} className="text-primary" /> 🕒 {now.toLocaleString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setPhoto(null); }}
              className="text-xs font-medium text-destructive underline"
            >
              Remove & retake
            </button>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-md transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
        >
          <Upload size={18} className="mr-2 inline-block" />
          Submit
        </button>

        {/* Success */}
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center gap-2 rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success"
            >
              <CheckCircle2 size={20} />
              ✅ Uploaded successfully
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
