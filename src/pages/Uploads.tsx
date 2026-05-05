import { useEffect, useRef, useState } from "react";
import { Download, Trash2, Upload, FileSpreadsheet, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface SheetUpload {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number | null;
  kind: string;
  created_at: string;
}

const KINDS = [
  { value: "team", label: "Team" },
  { value: "laptops", label: "Laptops" },
  { value: "general", label: "General" },
];

const formatBytes = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
};

export default function Uploads() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("team");
  const [items, setItems] = useState<SheetUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sheet_uploads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const handleFile = async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext ?? "")) {
      toast.error("Only .csv, .xlsx, .xls files are allowed");
      return;
    }
    setUploading(true);
    try {
      const path = `${user.id}/${kind}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("sheet-uploads")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("sheet_uploads").insert({
        uploaded_by: user.id,
        file_name: file.name,
        storage_path: path,
        size_bytes: file.size,
        kind,
      });
      if (insErr) throw insErr;

      toast.success("File uploaded");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = async (item: SheetUpload) => {
    const { data, error } = await supabase.storage
      .from("sheet-uploads")
      .createSignedUrl(item.storage_path, 60);
    if (error || !data) {
      toast.error(error?.message ?? "Could not generate link");
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async (item: SheetUpload) => {
    if (!confirm(`Delete "${item.file_name}"?`)) return;
    const { error: sErr } = await supabase.storage
      .from("sheet-uploads")
      .remove([item.storage_path]);
    if (sErr) {
      toast.error(sErr.message);
      return;
    }
    const { error: dErr } = await supabase
      .from("sheet_uploads")
      .delete()
      .eq("id", item.id);
    if (dErr) toast.error(dErr.message);
    else {
      toast.success("Deleted");
      load();
    }
  };

  if (roleLoading) {
    return <div className="text-muted-foreground">Loading…</div>;
  }

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" /> Admin only
          </CardTitle>
          <CardDescription>
            You need administrator access to manage sheet uploads.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sheet uploads</h1>
        <p className="text-sm text-muted-foreground">
          Upload Excel/CSV files. Stored securely and accessible only to admins.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload new sheet</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uploaded files</CardTitle>
          <CardDescription>{items.length} file(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> No files uploaded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.file_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.kind}</Badge>
                      </TableCell>
                      <TableCell>{formatBytes(item.size_bytes)}</TableCell>
                      <TableCell>
                        {new Date(item.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDownload(item)}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(item)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
