import { useEffect, useState } from "react";
import { Eye, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  imagePath: string | null | undefined;
  /** Optional label for a11y; defaults to material code if provided */
  label?: string;
  /** Tailwind classes for the trigger button; pass empty to use default chip */
  className?: string;
  size?: number;
};

/**
 * Eye-icon trigger that, on click, lazily fetches a signed URL for the
 * material's reference image and displays it in a simple modal.
 * If imagePath is null/empty the icon renders disabled/faded.
 */
export function MaterialImageViewer({ imagePath, label, className, size = 14 }: Props) {
  const has = !!imagePath;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !imagePath || url) return;
    let alive = true;
    setLoading(true);
    setError(null);
    supabase.storage
      .from("proofs")
      .createSignedUrl(imagePath, 600)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data?.signedUrl) {
          setError(error?.message ?? "Failed to load image");
        } else {
          setUrl(data.signedUrl);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, imagePath, url]);

  const base =
    className ??
    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (has) setOpen(true);
        }}
        disabled={!has}
        aria-label={has ? `View image for ${label ?? "material"}` : "No image available"}
        className={`${base} ${!has ? "opacity-40 cursor-not-allowed" : ""}`}
      >
        <Eye size={size} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-2 top-2 z-10 rounded-full bg-background/90 p-1.5 text-foreground shadow hover:bg-background"
            >
              <X size={16} />
            </button>
            <div className="flex min-h-[200px] items-center justify-center bg-muted">
              {loading && <Loader2 className="animate-spin text-muted-foreground" size={28} />}
              {!loading && error && (
                <p className="p-6 text-center text-xs font-semibold text-destructive">{error}</p>
              )}
              {!loading && !error && url && (
                <img
                  src={url}
                  alt={label ?? "Material reference"}
                  className="max-h-[85vh] w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
