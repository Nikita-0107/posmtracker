import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { compressImage } from "@/lib/compress-image";

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];

export type StagedImage = {
  file: File; // compressed
  previewUrl: string;
};

type Props = {
  value: StagedImage | null;
  onChange: (v: StagedImage | null) => void;
  error?: string | null;
  required?: boolean;
};

export function MaterialImagePicker({ value, onChange, error, required }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setLocalError(null);
    const type = file.type.toLowerCase();
    if (type && !ALLOWED.includes(type) && !type.startsWith("image/")) {
      setLocalError("Please choose an image file");
      return;
    }
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      const previewUrl = URL.createObjectURL(compressed);
      onChange({ file: compressed, previewUrl });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Failed to process image");
    } finally {
      setBusy(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  function clear() {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
  }

  const showError = localError ?? error ?? null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">
          Material Image {required && <span className="text-destructive">*</span>}
        </span>
        <span className="text-[9px] text-muted-foreground">auto-compressed</span>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!value && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className={`flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-2 py-2 text-[11px] font-bold transition active:scale-[0.99] disabled:opacity-50 ${
              showError ? "border-destructive bg-destructive/5 text-destructive" : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            }`}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={busy}
            className={`flex items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-2 py-2 text-[11px] font-bold transition active:scale-[0.99] disabled:opacity-50 ${
              showError ? "border-destructive bg-destructive/5 text-destructive" : "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
            }`}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
            Upload
          </button>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-2">
          <img
            src={value.previewUrl}
            alt="Material preview"
            className="h-14 w-14 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] font-bold text-success">
              <CheckCircle2 size={12} /> Image ready
            </p>
            <p className="text-[10px] text-muted-foreground">
              {(value.file.size / 1024).toFixed(0)} KB · {value.file.type.replace("image/", "")}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
            >
              Change
            </button>
            <button
              type="button"
              onClick={clear}
              className="flex items-center justify-center rounded-md px-2 py-0.5 text-[10px] font-semibold text-destructive hover:bg-destructive/10"
              aria-label="Remove image"
            >
              <X size={10} />
            </button>
          </div>
        </div>
      )}

      {showError && (
        <p className="flex items-center gap-1 text-[10px] font-semibold text-destructive">
          <AlertTriangle size={10} /> {showError}
        </p>
      )}
    </div>
  );
}
