import { useRef, useState } from "react";
import { FileUp, X, Loader2, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
const ACCEPT_ATTR = "application/pdf,image/jpeg,image/png";

export type InvoiceFileValue = {
  path: string; // storage path inside `proofs` bucket (under invoices/)
  name: string;
  type: string;
  size: number;
} | null;

type Props = {
  wsp: string;
  userId: string;
  value: InvoiceFileValue;
  onChange: (v: InvoiceFileValue) => void;
  error?: string | null;
};

export function InvoiceFileUpload({ wsp, userId, value, onChange, error }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setLocalError(null);

    if (!ALLOWED.includes(file.type.toLowerCase())) {
      setLocalError("Only PDF, JPG or PNG files are allowed");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("File must be 10MB or smaller");
      return;
    }

    setBusy(true);
    try {
      // Best-effort cleanup of previous file
      if (value?.path) void supabase.storage.from("proofs").remove([value.path]);

      const ext =
        file.name.split(".").pop()?.toLowerCase() ||
        (file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg");
      const path = `invoices/${wsp}/${userId}/invoice-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("proofs")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: "3600",
        });

      if (upErr) {
        setLocalError(upErr.message || "Failed to upload invoice");
        setBusy(false);
        return;
      }

      onChange({ path, name: file.name, type: file.type, size: file.size });
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    if (value?.path) void supabase.storage.from("proofs").remove([value.path]);
    onChange(null);
    setLocalError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const showError = localError ?? error ?? null;
  const isPdf = value?.type === "application/pdf";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          Invoice File <span className="text-destructive">*</span>
        </span>
        <span className="text-[10px] text-muted-foreground">PDF / JPG / PNG · max 10MB</span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {!value && (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-3 py-4 text-xs font-bold text-primary transition hover:bg-primary/10 active:scale-[0.99] disabled:opacity-50"
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
          {busy ? "Uploading…" : "Upload Invoice"}
        </button>
      )}

      {value && (
        <div className="space-y-2 rounded-xl border-2 border-success/30 bg-success/5 p-2">
          <div className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              {isPdf ? <FileText size={18} /> : <FileUp size={18} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground">{value.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {(value.size / 1024).toFixed(0)} KB · {isPdf ? "PDF" : value.type.replace("image/", "").toUpperCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Remove invoice"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-success">
              <CheckCircle2 size={12} /> Uploaded
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-md px-2 py-1 font-semibold text-primary hover:bg-primary/10"
            >
              Change
            </button>
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
