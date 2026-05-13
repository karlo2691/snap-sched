import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useLaptopExcelSync } from "@/hooks/useLaptopExcelSync";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Laptop,
  Plus,
  Download,
  Pencil,
  Loader2,
  Trash2,
  Search,
  X,
  FilterX,
} from "lucide-react";

// ─── Schema ───────────────────────────────────────────────────────────────────

const laptopSchema = z.object({
  asset_tag: z.string().min(1, "Asset tag is required"),
  model: z.string().optional(),
  team: z.string().optional(),
  assigned_member_id: z.string().nullable().optional(),
});

type LaptopFormValues = z.infer<typeof laptopSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LaptopRow {
  id: string;
  asset_tag: string;
  model: string | null;
  team: string | null;
  assigned_member_id: string | null;
  owner_id: string;
  created_at: string;
  team_members: { id: string; name: string; email: string } | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  team: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LaptopTabProps {
  ownerId: string;
}

export function LaptopTab({ ownerId }: LaptopTabProps) {
  const queryClient = useQueryClient();
  const { triggerSync, downloadExcel, isSyncing } = useLaptopExcelSync();

  // ── Form / edit state ──────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLaptop, setEditingLaptop] = useState<LaptopRow | null>(null);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);       // bulk selected delete
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false); // delete ALL data

  // ── Filter state ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTeam, setFilterTeam] = useState("all");
  const [filterOwner, setFilterOwner] = useState("all");

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: laptops = [], isLoading: laptopsLoading } = useQuery({
    queryKey: ["laptops", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laptops")
        .select(
          `id, asset_tag, model, team, assigned_member_id, owner_id, created_at,
           team_members ( id, name, email )`
        )
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LaptopRow[];
    },
    enabled: !!ownerId,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team_members", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, name, email, team")
        .eq("owner_id", ownerId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
    enabled: !!ownerId,
  });

  // ─── Filter options derived from data ────────────────────────────────────

  const teamOptions = useMemo(() => {
    const teams = laptops
      .map((l) => l.team)
      .filter((t): t is string => !!t);
    return Array.from(new Set(teams)).sort();
  }, [laptops]);

  const ownerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    laptops.forEach((l) => {
      const member = Array.isArray(l.team_members)
        ? l.team_members[0]
        : l.team_members;
      if (member) seen.set(member.id, member.name);
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [laptops]);

  // ─── Filtered dataset (client-side) ──────────────────────────────────────

  const filteredLaptops = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return laptops.filter((l) => {
      const member = Array.isArray(l.team_members)
        ? l.team_members[0]
        : l.team_members;

      // Text search — asset tag, model, team, owner name, email
      const matchesSearch =
        !q ||
        l.asset_tag.toLowerCase().includes(q) ||
        (l.model ?? "").toLowerCase().includes(q) ||
        (l.team ?? "").toLowerCase().includes(q) ||
        (member?.name ?? "").toLowerCase().includes(q) ||
        (member?.email ?? "").toLowerCase().includes(q);

      // Team dropdown filter
      const matchesTeam =
        filterTeam === "all" ||
        (filterTeam === "__unassigned__"
          ? !l.team
          : l.team === filterTeam);

      // Owner dropdown filter
      const matchesOwner =
        filterOwner === "all" ||
        (filterOwner === "__unassigned__"
          ? !l.assigned_member_id
          : member?.id === filterOwner);

      return matchesSearch && matchesTeam && matchesOwner;
    });
  }, [laptops, searchQuery, filterTeam, filterOwner]);

  const hasActiveFilters =
    searchQuery !== "" || filterTeam !== "all" || filterOwner !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setFilterTeam("all");
    setFilterOwner("all");
  };

  // ─── Derived selection values (operate on filtered set) ──────────────────

  const filteredIds = useMemo(
    () => filteredLaptops.map((l) => l.id),
    [filteredLaptops]
  );
  const selectedCount = selectedIds.size;
  const allSelected =
    filteredIds.length > 0 &&
    filteredIds.every((id) => selectedIds.has(id));
  const someSelected =
    filteredIds.some((id) => selectedIds.has(id)) && !allSelected;

  // ─── Select All handler (only operates on visible/filtered rows) ──────────

  const handleSelectAll = (checked: boolean | "indeterminate") => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked === true) {
        filteredIds.forEach((id) => next.add(id));
      } else {
        filteredIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  // ─── Individual row checkbox ──────────────────────────────────────────────

  const handleRowSelect = (id: string, checked: boolean | "indeterminate") => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      checked === true ? next.add(id) : next.delete(id);
      return next;
    });
  };

  // ─── Form ─────────────────────────────────────────────────────────────────

  const form = useForm<LaptopFormValues>({
    resolver: zodResolver(laptopSchema),
    defaultValues: { asset_tag: "", model: "", team: "", assigned_member_id: null },
  });

  const openCreate = () => {
    setEditingLaptop(null);
    form.reset({ asset_tag: "", model: "", team: "", assigned_member_id: null });
    setDialogOpen(true);
  };

  const openEdit = (laptop: LaptopRow) => {
    setEditingLaptop(laptop);
    form.reset({
      asset_tag: laptop.asset_tag,
      model: laptop.model ?? "",
      team: laptop.team ?? "",
      assigned_member_id: laptop.assigned_member_id ?? null,
    });
    setDialogOpen(true);
  };

  // ─── Create mutation ──────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (values: LaptopFormValues) => {
      const { data, error } = await supabase
        .from("laptops")
        .insert({
          asset_tag: values.asset_tag,
          model: values.model || null,
          team: values.team || null,
          assigned_member_id: values.assigned_member_id || null,
          owner_id: ownerId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("Laptop added", {
        description: "Record created and Excel sheet is being updated.",
      });
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["laptops", ownerId] });
      await triggerSync(ownerId, true);
    },
    onError: (err: Error) =>
      toast.error("Failed to add laptop", { description: err.message }),
  });

  // ─── Update mutation ──────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: async (values: LaptopFormValues) => {
      if (!editingLaptop) throw new Error("No laptop selected");
      const { data, error } = await supabase
        .from("laptops")
        .update({
          asset_tag: values.asset_tag,
          model: values.model || null,
          team: values.team || null,
          assigned_member_id: values.assigned_member_id || null,
        })
        .eq("id", editingLaptop.id)
        .eq("owner_id", ownerId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("Laptop updated", {
        description: "Record updated and Excel sheet is being synced.",
      });
      setDialogOpen(false);
      setEditingLaptop(null);
      queryClient.invalidateQueries({ queryKey: ["laptops", ownerId] });
      await triggerSync(ownerId, true);
    },
    onError: (err: Error) =>
      toast.error("Failed to update laptop", { description: err.message }),
  });

  // ─── Bulk delete selected mutation ────────────────────────────────────────

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("laptops")
        .delete()
        .in("id", ids)
        .eq("owner_id", ownerId);
      if (error) throw error;
      return ids;
    },
    onSuccess: async (deletedIds) => {
      const count = deletedIds.length;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        deletedIds.forEach((id) => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["laptops", ownerId] });
      await triggerSync(ownerId, true);
      toast.success(`${count} laptop${count === 1 ? "" : "s"} deleted`, {
        description: "Excel data list has been updated.",
      });
    },
    onError: (err: Error) =>
      toast.error("Bulk delete failed", { description: err.message }),
  });

  // ─── Delete ALL mutation ──────────────────────────────────────────────────

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      // Deletes every laptop record belonging to this owner — single query
      const { error } = await supabase
        .from("laptops")
        .delete()
        .eq("owner_id", ownerId);
      if (error) throw error;
    },
    onSuccess: async () => {
      setSelectedIds(new Set());
      clearFilters();
      queryClient.invalidateQueries({ queryKey: ["laptops", ownerId] });
      await triggerSync(ownerId, true);
      toast.success("All laptops deleted", {
        description: "The dataset and Excel sheet have been cleared.",
      });
    },
    onError: (err: Error) =>
      toast.error("Delete all failed", { description: err.message }),
  });

  const handleConfirmDelete = () => {
    setConfirmDeleteOpen(false);
    bulkDeleteMutation.mutate(Array.from(selectedIds));
  };

  const handleConfirmDeleteAll = () => {
    setConfirmDeleteAllOpen(false);
    deleteAllMutation.mutate();
  };

  const onSubmit = (values: LaptopFormValues) => {
    editingLaptop ? updateMutation.mutate(values) : createMutation.mutate(values);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isBulkDeleting = bulkDeleteMutation.isPending;
  const isDeletingAll = deleteAllMutation.isPending;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Top header bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Laptop className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">Laptops</h2>
          <Badge variant="secondary">{laptops.length}</Badge>
          {hasActiveFilters && (
            <Badge variant="outline" className="text-xs">
              {filteredLaptops.length} shown
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Export Excel */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadExcel(ownerId)}
            disabled={isSyncing || laptops.length === 0}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export Excel
          </Button>

          {/* Delete All */}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/40 hover:bg-destructive/5"
            onClick={() => setConfirmDeleteAllOpen(true)}
            disabled={isDeletingAll || laptops.length === 0}
          >
            {isDeletingAll ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete All
          </Button>

          {/* Add Laptop */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Laptop
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingLaptop ? "Edit Laptop" : "Add New Laptop"}
                </DialogTitle>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="asset_tag"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Asset Tag *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. LPT-0042" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Dell XPS 15"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="team"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Team</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Engineering"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="assigned_member_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assigned Owner</FormLabel>
                        <Select
                          onValueChange={(val) =>
                            field.onChange(val === "none" ? null : val)
                          }
                          value={field.value ?? "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a team member" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">— Unassigned —</SelectItem>
                            {teamMembers.map((member) => (
                              <SelectItem key={member.id} value={member.id}>
                                {member.name}
                                {member.team ? ` (${member.team})` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      {editingLaptop ? "Save Changes" : "Add Laptop"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Filter bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Text search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search asset tag, model, owner…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Team filter */}
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            <SelectItem value="__unassigned__">No team</SelectItem>
            {teamOptions.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Owner filter */}
        <Select value={filterOwner} onValueChange={setFilterOwner}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All owners" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            <SelectItem value="__unassigned__">Unassigned</SelectItem>
            {ownerOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground h-9"
          >
            <FilterX className="h-4 w-4 mr-1.5" />
            Clear filters
          </Button>
        )}
      </div>

      {/* ── Bulk action bar — appears only when rows are selected ────────────── */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2.5">
          <span className="text-sm font-medium text-destructive">
            {selectedCount} record{selectedCount === 1 ? "" : "s"} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isBulkDeleting}
          >
            {isBulkDeleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Delete Selected
          </Button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────────── */}
      {laptopsLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading laptops…
        </div>
      ) : laptops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <Laptop className="h-10 w-10 opacity-30" />
          <p className="text-sm">No laptops yet. Add your first one.</p>
        </div>
      ) : filteredLaptops.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <FilterX className="h-10 w-10 opacity-30" />
          <p className="text-sm">No laptops match your filters.</p>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {/* ── Master Select All (scoped to filtered rows) ─────────── */}
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allSelected ? true : someSelected ? "indeterminate" : false
                    }
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all visible laptops"
                  />
                </TableHead>
                <TableHead>Asset Tag</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Assigned Owner</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filteredLaptops.map((laptop) => {
                const member = Array.isArray(laptop.team_members)
                  ? laptop.team_members[0]
                  : laptop.team_members;
                const isSelected = selectedIds.has(laptop.id);

                return (
                  <TableRow
                    key={laptop.id}
                    className={isSelected ? "bg-muted/50" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleRowSelect(laptop.id, checked)
                        }
                        aria-label={`Select ${laptop.asset_tag}`}
                      />
                    </TableCell>

                    <TableCell className="font-mono text-sm">
                      {laptop.asset_tag}
                    </TableCell>
                    <TableCell>{laptop.model ?? "—"}</TableCell>
                    <TableCell>{laptop.team ?? "—"}</TableCell>

                    <TableCell>
                      {member ? (
                        <span className="font-medium">{member.name}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Unassigned
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {member?.email ?? "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(laptop)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Row count footer */}
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            Showing {filteredLaptops.length} of {laptops.length} record
            {laptops.length === 1 ? "" : "s"}
            {selectedCount > 0 && (
              <span className="ml-2 font-medium text-foreground">
                · {selectedCount} selected
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk delete selected confirmation ────────────────────────────────── */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selectedCount} laptop{selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              <strong>
                {selectedCount} selected record{selectedCount === 1 ? "" : "s"}
              </strong>{" "}
              from the database and update the Excel data list. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Yes, delete {selectedCount === 1 ? "it" : "all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete ALL confirmation ───────────────────────────────────────────── */}
      <AlertDialog
        open={confirmDeleteAllOpen}
        onOpenChange={setConfirmDeleteAllOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Delete all {laptops.length} laptop records?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently erase{" "}
              <strong>every laptop record</strong> in this dataset — including
              all assigned owner data — and clear the Excel sheet. There is no
              way to recover this data. Are you absolutely sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
