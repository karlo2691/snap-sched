import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SheetImportProps<T> {
  /** Map a normalized row (lowercased keys) into a typed payload, or return null to skip. */
  mapRow: (row: Record<string, string>) => T | null;
  /** Persist the mapped rows. Should return number of inserted rows. */
  onImport: (rows: T[]) => Promise<number>;
  /** Accepted column header hints shown to the user. */
  expectedColumns: string[];
  label?: string;
}

export function SheetImport<T>({ mapRow, onImport, expectedColumns, label = "Import sheet" }: SheetImportProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("Sheet is empty");
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const mapped: T[] = [];
      let skipped = 0;
      for (const raw of json) {
        const norm: Record<string, string> = {};
        for (const k of Object.keys(raw)) {
          norm[k.trim().toLowerCase()] = String(raw[k] ?? "").trim();
        }
        const row = mapRow(norm);
        if (row) mapped.push(row);
        else skipped++;
      }

      if (mapped.length === 0) {
        toast.error("No valid rows found. Expected columns: " + expectedColumns.join(", "));
        return;
      }

      const inserted = await onImport(mapped);
      toast.success(`Imported ${inserted} row${inserted === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped}` : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title={`Expected columns: ${expectedColumns.join(", ")}`}
      >
        <Upload className="h-4 w-4 mr-2" />
        {busy ? "Importing…" : label}
      </Button>
    </>
  );
}
