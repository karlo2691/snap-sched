import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { laptopSchema } from "@/lib/validators";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface Laptop {
  id: string;
  asset_tag: string;
  model: string | null;
  team: string | null;
  assigned_member_id: string | null;
  team_members?: { name: string } | null;
}
interface Member { id: string; name: string }

const Laptops = () => {
  const { user } = useAuth();
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [editing, setEditing] = useState<Laptop | null>(null);
  const [assigned, setAssigned] = useState<string>("none");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: lp, error: e1 }, { data: tm, error: e2 }] = await Promise.all([
      supabase.from("laptops").select("id,asset_tag,model,team,assigned_member_id,team_members(name)").order("asset_tag"),
      supabase.from("team_members").select("id,name").order("name"),
    ]);
    if (e1) toast.error(e1.message);
    else setLaptops((lp as Laptop[]) ?? []);
    if (e2) toast.error(e2.message);
    else setMembers(tm ?? []);
  };
  useEffect(() => { load(); }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    const parsed = laptopSchema.safeParse({
      asset_tag: fd.get("asset_tag"),
      model: fd.get("model"),
      team: fd.get("team"),
      assigned_member_id: assigned === "none" ? null : assigned,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const payload = {
      asset_tag: parsed.data.asset_tag,
      model: parsed.data.model || null,
      team: parsed.data.team || null,
      assigned_member_id: parsed.data.assigned_member_id ?? null,
    };
    const { error } = editing
      ? await supabase.from("laptops").update(payload).eq("id", editing.id)
      : await supabase.from("laptops").insert({ ...payload, owner_id: user.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Laptop updated" : "Laptop added");
    setOpen(false);
    setEditing(null);
    setAssigned("none");
    load();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this laptop and its schedules?")) return;
    const { error } = await supabase.from("laptops").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const openEdit = (l: Laptop) => {
    setEditing(l);
    setAssigned(l.assigned_member_id ?? "none");
    setOpen(true);
  };
  const openNew = () => {
    setEditing(null);
    setAssigned("none");
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Laptops</h1>
          <p className="text-sm text-muted-foreground">Inventory of laptops to maintain.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add laptop</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit laptop" : "New laptop"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="asset_tag">Asset tag</Label>
                <Input id="asset_tag" name="asset_tag" defaultValue={editing?.asset_tag} required maxLength={60} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" name="model" defaultValue={editing?.model ?? ""} maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team">Team</Label>
                <Input id="team" name="team" defaultValue={editing?.team ?? ""} maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label>Assigned to</Label>
                <Select value={assigned} onValueChange={setAssigned}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>Inventory ({laptops.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset tag</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laptops.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No laptops yet.</TableCell></TableRow>
              )}
              {laptops.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono font-medium">{l.asset_tag}</TableCell>
                  <TableCell>{l.model ?? "—"}</TableCell>
                  <TableCell>{l.team ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{l.team_members?.name ?? "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(l)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(l.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Laptops;
