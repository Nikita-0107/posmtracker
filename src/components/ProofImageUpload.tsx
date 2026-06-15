import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/compress-image";


const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const UPLOAD_LOG_KEY = "posm-proof-upload-debug";
const PICKER_STATE_KEY = "posm-proof-upload-picker";

function isSupportedImage(file: File) {
  if (file.type) return file.type.toLowerCase().startsWith("image/");
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

function recordUploadStage(stage: string, details: Record<string, unknown> = {}) {
  const entry = {
    at: new Date().toISOString(),
    stage,
    route: typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    details,
  };
  console.log(`[ProofImageUpload] ${stage}`, details);
  try {
    const existing = JSON.parse(window.localStorage.getItem(UPLOAD_LOG_KEY) || "[]");
    const rows = Array.isArray(existing) ? existing : [];
    window.localStorage.setItem(UPLOAD_LOG_KEY, JSON.stringify([...rows, entry].slice(-60)));
  } catch {
    // Diagnostics must never block the upload flow.
  }
}

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
  const pickerTokenRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const pendingPicker = window.localStorage.getItem(PICKER_STATE_KEY);
      if (pendingPicker) recordUploadStage("component-mounted-after-pending-picker", { pendingPicker });
    } catch {
      // ignore diagnostic storage failures
    }

    const onPageHide = () => recordUploadStage("pagehide", { pickerOpen: !!pickerTokenRef.current, busy });
    const onPageShow = (event: PageTransitionEvent) => recordUploadStage("pageshow", { persisted: event.persisted, busy });
    const onVisibility = () => recordUploadStage("visibilitychange", { state: document.visibilityState, pickerOpen: !!pickerTokenRef.current, busy });

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [busy]);

  function openPicker(source: "camera" | "gallery") {
    const token = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    pickerTokenRef.current = token;
    try {
      window.localStorage.setItem(
        PICKER_STATE_KEY,
        JSON.stringify({ token, source, startedAt: new Date().toISOString(), kind, wsp }),
      );
    } catch {
      // ignore diagnostic storage failures
    }
    recordUploadStage("picker-open", { token, source, kind, wsp });
    if (source === "camera") cameraRef.current?.click();
    else galleryRef.current?.click();
  }

  async function handleFile(file: File | undefined | null, source: "camera" | "gallery") {
    const token = pickerTokenRef.current;
    recordUploadStage("picker-returned", { token, source, hasFile: !!file });
    if (!file) return;
    setLocalError(null);
    recordUploadStage("file-selected", {
      token,
      source,
      name: file.name,
      type: file.type,
      sizeKB: Math.round(file.size / 1024),
      kind,
    });

    if (!isSupportedImage(file)) {
      recordUploadStage("invalid-file-type", { token, source, name: file.name, type: file.type });
      setLocalError("Only image files are allowed");
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
        recordUploadStage("compressed", {
          token,
          source,
          fromKB: Math.round(file.size / 1024),
          toKB: Math.round(uploadFile.size / 1024),
          type: uploadFile.type,
        });
      } catch (cErr) {
        recordUploadStage("compression-failed", {
          token,
          source,
          error: cErr instanceof Error ? cErr.message : String(cErr),
        });
      }

      const ext =
        uploadFile.type === "image/webp"
          ? "webp"
          : uploadFile.type === "image/png"
            ? "png"
            : "jpg";
      const path = `${wsp}/${userId}/${kind}-${Date.now()}.${ext}`;

      recordUploadStage("upload-start", { token, source, path, sizeKB: Math.round(uploadFile.size / 1024) });
      const { error: upErr } = await supabase.storage
        .from("proofs")
        .upload(path, uploadFile, {
          contentType: uploadFile.type,
          upsert: false,
          cacheControl: "3600",
        });

      if (upErr) {
        recordUploadStage("upload-error", { token, source, message: upErr.message, name: upErr.name });
        setLocalError(upErr.message || "Failed to upload image");
        setBusy(false);
        return;
      }

      const previewUrl = URL.createObjectURL(uploadFile);
      recordUploadStage("upload-success", { token, source, path });
      try {
        window.localStorage.removeItem(PICKER_STATE_KEY);
      } catch {
        // ignore diagnostic storage failures
      }
      pickerTokenRef.current = null;
      onChange({ path, previewUrl });
    } catch (err) {
      recordUploadStage("unexpected-error", {
        token,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
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
        <span className="text-[10px] text-muted-foreground">Image · max 8MB</span>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0], "camera")}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0], "gallery")}
      />

      {!value && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openPicker("camera")}
            disabled={busy}
            className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-4 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => openPicker("gallery")}
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
                onClick={() => openPicker("camera")}
                className="rounded-md px-2 py-1 font-semibold text-primary hover:bg-primary/10"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => openPicker("gallery")}
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
