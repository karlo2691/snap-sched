import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, Plus, Pencil, Loader2, Trash2, Search, X, FilterX,
} from "lucide-react";

// ─── Schema ───────────────────────────────────────────────────────────────────

const memberSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  team: z.string().optional(),
});

type MemberFormValues = z.infer<typeof memberSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemberRow {
  id: string;
  name: string;
  email: string;
  team: string | null;
  owner_id: string;
  created_at: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TeamMembersTabProps {
  ownerId: string;
}

export function TeamMembersTab({ ownerId }: TeamMembersTabProps) {
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberRow | null>(null);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTeam, setFilterTeam] = useState("all");

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team_members", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, name, email, team, owner_id, created_at")
        .eq("owner_id", ownerId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
    enabled: !!ownerId,
  });

  // ─── Filter options ───────────────────────────────────────────────────────

  const teamOptions = useMemo(() => {
    const teams = members.map((m) => m.team).filter((t): t is string => !!t);
    return Array.from(new Set(teams)).sort();
  }, [members]);

  // ─── Filtered dataset ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return members.filter((m) => {
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.team ?? "").toLowerCase().includes(q);
      const matchesTeam =
        filterTeam === "all" ||
        (filterTeam === "__unassigned__" ? !m.team : m.team === filterTeam);
      return matchesSearch && matchesTeam;
    });
  }, [members, searchQuery, filterTeam]);

  const hasActiveFilters = searchQuery !== "" || filterTeam !== "all";
  const clearFilters = () => { setSearchQuery(""); setFilterTeam("all"); };

  // ─── Selection ────────────────────────────────────────────────────────────

  const filteredIds = useMemo(() => filtered.map((m) => m.id), [filtered]);
  const selectedCount = selectedIds.size;
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id)) && !allSelected;

  const handleSelectAll = (checked: boolean | "indeterminate") => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked === true ? filteredIds.forEach((id) => next.add(id)) : filteredIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleRowSelect = (id: string, checked: boolean | "indeterminate") => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked === true ? next.add(id) : next.delete(id);
      return next;
    });
  };

  // ─── Form ─────────────────────────────────────────────────────────────────

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberSchema),
    defaultValues: { name: "", email: "", team: "" },
  });

  const openCreate = () => {
    setEditingMember(null);
    form.reset({ name: "", email: "", team: "" });
    setDialogOpen(true);
  };

  const openEdit = (m: MemberRow) => {
    setEditingMember(m);
    form.reset({ name: m.name, email: m.email, team: m.team ?? "" });
    setDialogOpen(true);
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (values: MemberFormValues) => {
      const { data, error } = await supabase
        .from("team_members")
        .insert({ name: values.name, email: values.email, team: values.team || null, owner_id: ownerId })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Team member added");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["team_members", ownerId] });
    },
    onError: (err: Error) => toast.error("Failed to add member", { description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: MemberFormValues) => {
      if (!editingMember) throw new Error("No member selected");
      const { data, error } = await supabase
        .from("team_members")
        .update({ name: values.name, email: values.email, team: values.team || null })
        .eq("id", editingMember.id)
        .eq("owner_id", ownerId)
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Team member updated");
      setDialogOpen(false);
      setEditingMember(null);
      queryClient.invalidateQueries({ queryKey: ["team_members", ownerId] });
    },
    onError: (err: Error) => toast.error("Failed to update member", { description: err.message }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("team_members").delete().in("id", ids).eq("owner_id", ownerId);
      if (error) throw error;
      return ids;
    },
    onSuccess: (deletedIds) => {
      const count = deletedIds.length;
      setSelectedIds((prev) => { const next = new Set(prev); deletedIds.forEach((id) => next.delete(id)); return next; });
      queryClient.invalidateQueries({ queryKey: ["team_members", ownerId] });
      toast.success(`${count} member${count === 1 ? "" : "s"} deleted`);
    },
    onError: (err: Error) => toast.error("Bulk delete failed", { description: err.message }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("team_members").delete().eq("owner_id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      clearFilters();
      queryClient.invalidateQueries({ queryKey: ["team_members", ownerId] });
      toast.success("All team members deleted");
    },
    onError: (err: Error) => toast.error("Delete all failed", { description: err.message }),
  });

  const handleConfirmDelete = () => { setConfirmDeleteOpen(false); bulkDeleteMutation.mutate(Array.from(selectedIds)); };
  const handleConfirmDeleteAll = () => { setConfirmDeleteAllOpen(false); deleteAllMutation.mutate(); };
  const onSubmit = (values: MemberFormValues) => { editingMember ? updateMutation.mutate(values) : createMutation.mutate(values); };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isBulkDeleting = bulkDeleteMutation.isPending;
  const isDeletingAll = deleteAllMutation.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">Team Members</h2>
          <Badge variant="secondary">{members.length}</Badge>
          {hasActiveFilters && <Badge variant="outline" className="text-xs">{filtered.length} shown</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            className="text-destructive border-destructive/40 hover:bg-destructive/5"
            onClick={() => setConfirmDeleteAllOpen(true)}
            disabled={isDeletingAll || members.length === 0}
          >
            {isDeletingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete All
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Member</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingMember ? "Edit Member" : "Add Team Member"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl><Input placeholder="e.g. Jane Doe" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl><Input type="email" placeholder="e.g. jane@company.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="team" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team</FormLabel>
                      <FormControl><Input placeholder="e.g. Engineering" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingMember ? "Save Changes" : "Add Member"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, email, team…" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 pr-8 h-9" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All teams" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            <SelectItem value="__unassigned__">No team</SelectItem>
            {teamOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground h-9">
            <FilterX className="h-4 w-4 mr-1.5" />Clear filters
          </Button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <span className="text-sm font-medium text-destructive">{selectedCount} member{selectedCount === 1 ? "" : "s"} selected</span>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)} disabled={isBulkDeleting}>
            {isBulkDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete Selected
          </Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading team members…
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Users className="h-10 w-10 opacity-30" />
          <p className="text-sm">No team members yet. Add your first one.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <FilterX className="h-10 w-10 opacity-30" />
          <p className="text-sm">No members match your filters.</p>
          <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all visible members"
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const isSelected = selectedIds.has(m.id);
                return (
                  <TableRow key={m.id} className={isSelected ? "bg-muted/50" : undefined}>
                    <TableCell>
                      <Checkbox checked={isSelected} onCheckedChange={(c) => handleRowSelect(m.id, c)} aria-label={`Select ${m.name}`} />
                    </TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      {m.team
                        ? <Badge variant="secondary" className="text-xs">{m.team}</Badge>
                        : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            Showing {filtered.length} of {members.length} member{members.length === 1 ? "" : "s"}
            {selectedCount > 0 && <span className="ml-2 font-medium text-foreground">· {selectedCount} selected</span>}
          </div>
        </div>
      )}

      {/* Bulk delete selected */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} member{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{selectedCount} selected member{selectedCount === 1 ? "" : "s"}</strong> from the database. Laptops assigned to them will become unassigned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 mr-2" />Yes, delete {selectedCount === 1 ? "them" : "all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete ALL */}
      <AlertDialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete all {members.length} team members?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently erase <strong>every team member</strong> and unassign all laptops. There is no way to recover this data. Are you absolutely sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeletingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
