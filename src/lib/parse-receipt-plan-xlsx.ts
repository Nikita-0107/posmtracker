import * as XLSX from "xlsx";

export type ParsedReceiptRow = {
  row: number;
  material_code: string;
  material_description: string;
  qty: number;
};
export type ParseRowError = { row: number; message: string };
export type ParseResult = {
  rows: ParsedReceiptRow[];
  errors: ParseRowError[];
};

function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const HEADER_MAP: Record<string, "material_code" | "material_description" | "qty"> = {
  materialcode: "material_code",
  code: "material_code",
  material: "material_code",
  materialdescription: "material_description",
  description: "material_description",
  desc: "material_description",
  name: "material_description",
  materialname: "material_description",
  qty: "qty",
  quantity: "qty",
};

export async function parseReceiptPlanXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (raw.length === 0) return { rows: [], errors: [{ row: 0, message: "Sheet is empty" }] };

  const firstKeys = Object.keys(raw[0]);
  const colMap: Partial<Record<"material_code" | "material_description" | "qty", string>> = {};
  for (const k of firstKeys) {
    const mapped = HEADER_MAP[normalizeHeader(k)];
    if (mapped) colMap[mapped] = k;
  }
  const missing = (["material_code", "material_description", "qty"] as const).filter(
    (c) => !colMap[c],
  );
  if (missing.length) {
    return {
      rows: [],
      errors: [{ row: 0, message: `Missing columns: ${missing.join(", ")}` }],
    };
  }

  const rows: ParsedReceiptRow[] = [];
  const errors: ParseRowError[] = [];
  const seen = new Map<string, number>(); // code -> index in rows

  raw.forEach((r, i) => {
    const rowNo = i + 2;
    const code = String(r[colMap.material_code!] ?? "").trim();
    const desc = String(r[colMap.material_description!] ?? "").trim();
    const qtyRaw = r[colMap.qty!];
    const qty = typeof qtyRaw === "number" ? qtyRaw : Number(String(qtyRaw).trim());

    if (!code && !desc && !qtyRaw) return;

    if (!code) {
      errors.push({ row: rowNo, message: "Material code is empty" });
      return;
    }
    if (!desc) {
      errors.push({ row: rowNo, message: "Material description is empty" });
      return;
    }
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
      errors.push({ row: rowNo, message: "Quantity must be a positive integer" });
      return;
    }

    const existingIdx = seen.get(code);
    if (existingIdx !== undefined) {
      rows[existingIdx].qty += qty;
    } else {
      seen.set(code, rows.length);
      rows.push({ row: rowNo, material_code: code, material_description: desc, qty });
    }
  });

  return { rows, errors };
}
