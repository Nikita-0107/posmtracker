import { useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";


const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED = ["image/jpeg", "image/jpg", "image/png"];

export type ProofImageValue = {
  path: string; // storage path inside `proofs` bucket
  previewUrl: string; // local object URL for preview
} | null;

type Props = {
  wsp: string;
  userId: string;
  kind: "receive" | "dispatch";
  value: ProofImageValue;
  onChange: (v: ProofImageValue) => void;
  error?: string | null;
  label?: string;
};

export function ProofImageUpload({ wsp, userId, kind, value, onChange, error, label }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setLocalError(null);
    console.log("[ProofImageUpload] file selected", {
      name: file.name,
      type: file.type,
      sizeKB: Math.round(file.size / 1024),
      kind,
    });

    if (!ALLOWED.includes(file.type.toLowerCase())) {
      setLocalError("Only JPG or PNG images are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Image must be 8MB or smaller");
      return;
    }

    setBusy(true);
    try {
      // Clean up previous preview URL if any
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);

      // Compress in-browser before upload. This dramatically reduces memory
      // pressure on mobile (camera photos are often 8–12MP / multi-MB) which
      // is the root cause of iOS/Android tabs being evicted while the camera
      // picker is foregrounded — the page would then reload and lose state.
      let uploadFile = file;
      try {
        uploadFile = await compressImage(file);
        console.log("[ProofImageUpload] compressed", {
          fromKB: Math.round(file.size / 1024),
          toKB: Math.round(uploadFile.size / 1024),
          type: uploadFile.type,
        });
      } catch (cErr) {
        console.warn("[ProofImageUpload] compression failed, uploading original", cErr);
      }

      const ext =
        uploadFile.type === "image/webp"
          ? "webp"
          : uploadFile.type === "image/png"
            ? "png"
            : "jpg";
      const path = `${wsp}/${userId}/${kind}-${Date.now()}.${ext}`;

      console.log("[ProofImageUpload] upload start", { path, sizeKB: Math.round(uploadFile.size / 1024) });
      const { error: upErr } = await supabase.storage
        .from("proofs")
        .upload(path, uploadFile, {
          contentType: uploadFile.type,
          upsert: false,
          cacheControl: "3600",
        });

      if (upErr) {
        console.error("[ProofImageUpload] upload error", upErr);
        setLocalError(upErr.message || "Failed to upload image");
        setBusy(false);
        return;
      }

      const previewUrl = URL.createObjectURL(uploadFile);
      console.log("[ProofImageUpload] upload success", { path });
      onChange({ path, previewUrl });
    } catch (err) {
      console.error("[ProofImageUpload] unexpected error", err);
      setLocalError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }


  async function handleClear() {
    if (value?.path) {
      // Best-effort delete from storage; ignore errors
      void supabase.storage.from("proofs").remove([value.path]);
    }
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setLocalError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  const showError = localError ?? error ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {label ?? (kind === "receive" ? "Upload PO Image" : "Proof Image")}{" "}
          <span className="text-destructive">*</span>
        </span>
        <span className="text-[10px] text-muted-foreground">JPG / PNG · max 8MB</span>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!value && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-4 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-4 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            Upload Image
          </button>
        </div>
      )}

      {value && (
        <div className="space-y-2 rounded-xl border-2 border-success/30 bg-success/5 p-2">
          <div className="relative overflow-hidden rounded-lg bg-muted">
            <img
              src={value.previewUrl}
              alt="Proof preview"
              className="max-h-56 w-full object-contain"
            />
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-foreground shadow hover:bg-background"
              aria-label="Remove image"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-success">
              <CheckCircle2 size={12} /> Uploaded
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="rounded-md px-2 py-1 font-semibold text-primary hover:bg-primary/10"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="rounded-md px-2 py-1 font-semibold text-primary hover:bg-primary/10"
              >
                Change
              </button>
            </div>
          </div>
        </div>
      )}

      {showError && (
        <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-[11px] font-semibold text-destructive">
          <AlertTriangle size={14} /> {showError}
        </div>
      )}
    </div>
  );
}
