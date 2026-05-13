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
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays, Plus, Pencil, Loader2, Trash2, Search, X, FilterX,
} from "lucide-react";

// ─── Schema ───────────────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  laptop_id: z.string().min(1, "Laptop is required"),
  scheduled_date: z.string().min(1, "Date is required"),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
});

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleRow {
  id: string;
  laptop_id: string;
  scheduled_date: string;
  status: string;
  notes: string | null;
  owner_id: string;
  created_at: string;
  notified_at: string | null;
  laptops: { id: string; asset_tag: string; model: string | null } | null;
}

interface LaptopOption {
  id: string;
  asset_tag: string;
  model: string | null;
}

const STATUS_OPTIONS = ["pending", "confirmed", "completed", "cancelled"];

// ─── Component ────────────────────────────────────────────────────────────────

interface SchedulesTabProps {
  ownerId: string;
}

export function SchedulesTab({ ownerId }: SchedulesTabProps) {
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleRow | null>(null);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterLaptop, setFilterLaptop] = useState("all");

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schedules")
        .select(`id, laptop_id, scheduled_date, status, notes, owner_id, created_at, notified_at,
                 laptops ( id, asset_tag, model )`)
        .eq("owner_id", ownerId)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
    enabled: !!ownerId,
  });

  const { data: laptopOptions = [] } = useQuery({
    queryKey: ["laptops_options", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laptops")
        .select("id, asset_tag, model")
        .eq("owner_id", ownerId)
        .order("asset_tag");
      if (error) throw error;
      return (data ?? []) as LaptopOption[];
    },
    enabled: !!ownerId,
  });

  // ─── Filter options ───────────────────────────────────────────────────────

  const laptopFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    schedules.forEach((s) => {
      const l = Array.isArray(s.laptops) ? s.laptops[0] : s.laptops;
      if (l) seen.set(l.id, l.asset_tag);
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [schedules]);

  // ─── Filtered dataset ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return schedules.filter((s) => {
      const laptop = Array.isArray(s.laptops) ? s.laptops[0] : s.laptops;
      const matchesSearch =
        !q ||
        (laptop?.asset_tag ?? "").toLowerCase().includes(q) ||
        (laptop?.model ?? "").toLowerCase().includes(q) ||
        s.status.toLowerCase().includes(q) ||
        (s.notes ?? "").toLowerCase().includes(q) ||
        s.scheduled_date.includes(q);
      const matchesStatus = filterStatus === "all" || s.status === filterStatus;
      const matchesLaptop =
        filterLaptop === "all" ||
        (Array.isArray(s.laptops) ? s.laptops[0]?.id : s.laptops?.id) === filterLaptop;
      return matchesSearch && matchesStatus && matchesLaptop;
    });
  }, [schedules, searchQuery, filterStatus, filterLaptop]);

  const hasActiveFilters = searchQuery !== "" || filterStatus !== "all" || filterLaptop !== "all";
  const clearFilters = () => { setSearchQuery(""); setFilterStatus("all"); setFilterLaptop("all"); };

  // ─── Selection ────────────────────────────────────────────────────────────

  const filteredIds = useMemo(() => filtered.map((s) => s.id), [filtered]);
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

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { laptop_id: "", scheduled_date: "", status: "pending", notes: "" },
  });

  const openCreate = () => {
    setEditingSchedule(null);
    form.reset({ laptop_id: "", scheduled_date: "", status: "pending", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (s: ScheduleRow) => {
    setEditingSchedule(s);
    form.reset({
      laptop_id: s.laptop_id,
      scheduled_date: s.scheduled_date,
      status: s.status,
      notes: s.notes ?? "",
    });
    setDialogOpen(true);
  };

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (values: ScheduleFormValues) => {
      const { data, error } = await supabase
        .from("schedules")
        .insert({ ...values, notes: values.notes || null, owner_id: ownerId })
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Schedule created");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["schedules", ownerId] });
    },
    onError: (err: Error) => toast.error("Failed to create schedule", { description: err.message }),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: ScheduleFormValues) => {
      if (!editingSchedule) throw new Error("No schedule selected");
      const { data, error } = await supabase
        .from("schedules")
        .update({ ...values, notes: values.notes || null })
        .eq("id", editingSchedule.id)
        .eq("owner_id", ownerId)
        .select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Schedule updated");
      setDialogOpen(false);
      setEditingSchedule(null);
      queryClient.invalidateQueries({ queryKey: ["schedules", ownerId] });
    },
    onError: (err: Error) => toast.error("Failed to update schedule", { description: err.message }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("schedules").delete().in("id", ids).eq("owner_id", ownerId);
      if (error) throw error;
      return ids;
    },
    onSuccess: (deletedIds) => {
      const count = deletedIds.length;
      setSelectedIds((prev) => { const next = new Set(prev); deletedIds.forEach((id) => next.delete(id)); return next; });
      queryClient.invalidateQueries({ queryKey: ["schedules", ownerId] });
      toast.success(`${count} schedule${count === 1 ? "" : "s"} deleted`);
    },
    onError: (err: Error) => toast.error("Bulk delete failed", { description: err.message }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("schedules").delete().eq("owner_id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      clearFilters();
      queryClient.invalidateQueries({ queryKey: ["schedules", ownerId] });
      toast.success("All schedules deleted");
    },
    onError: (err: Error) => toast.error("Delete all failed", { description: err.message }),
  });

  const handleConfirmDelete = () => { setConfirmDeleteOpen(false); bulkDeleteMutation.mutate(Array.from(selectedIds)); };
  const handleConfirmDeleteAll = () => { setConfirmDeleteAllOpen(false); deleteAllMutation.mutate(); };
  const onSubmit = (values: ScheduleFormValues) => { editingSchedule ? updateMutation.mutate(values) : createMutation.mutate(values); };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isBulkDeleting = bulkDeleteMutation.isPending;
  const isDeletingAll = deleteAllMutation.isPending;

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">Schedules</h2>
          <Badge variant="secondary">{schedules.length}</Badge>
          {hasActiveFilters && <Badge variant="outline" className="text-xs">{filtered.length} shown</Badge>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            className="text-destructive border-destructive/40 hover:bg-destructive/5"
            onClick={() => setConfirmDeleteAllOpen(true)}
            disabled={isDeletingAll || schedules.length === 0}
          >
            {isDeletingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete All
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Schedule</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingSchedule ? "Edit Schedule" : "Add Schedule"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="laptop_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Laptop *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a laptop" /></SelectTrigger></FormControl>
                        <SelectContent>
                          {laptopOptions.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.asset_tag}{l.model ? ` — ${l.model}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="scheduled_date" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scheduled Date *</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="notes" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl><Textarea placeholder="Optional notes…" {...field} value={field.value ?? ""} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isPending}>
                      {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingSchedule ? "Save Changes" : "Add Schedule"}
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
          <Input placeholder="Search date, laptop, status, notes…" value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 pr-8 h-9" />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterLaptop} onValueChange={setFilterLaptop}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All laptops" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All laptops</SelectItem>
            {laptopFilterOptions.map(([id, tag]) => <SelectItem key={id} value={id}>{tag}</SelectItem>)}
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
          <span className="text-sm font-medium text-destructive">{selectedCount} record{selectedCount === 1 ? "" : "s"} selected</span>
          <Button variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)} disabled={isBulkDeleting}>
            {isBulkDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete Selected
          </Button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading schedules…
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
          <CalendarDays className="h-10 w-10 opacity-30" />
          <p className="text-sm">No schedules yet. Add your first one.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <FilterX className="h-10 w-10 opacity-30" />
          <p className="text-sm">No schedules match your filters.</p>
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
                    aria-label="Select all visible schedules"
                  />
                </TableHead>
                <TableHead>Laptop</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => {
                const laptop = Array.isArray(s.laptops) ? s.laptops[0] : s.laptops;
                const isSelected = selectedIds.has(s.id);
                return (
                  <TableRow key={s.id} className={isSelected ? "bg-muted/50" : undefined}>
                    <TableCell>
                      <Checkbox checked={isSelected} onCheckedChange={(c) => handleRowSelect(s.id, c)} aria-label={`Select schedule ${s.id}`} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{laptop?.asset_tag ?? "—"}{laptop?.model ? <span className="text-muted-foreground ml-1 font-sans">({laptop.model})</span> : ""}</TableCell>
                    <TableCell>{new Date(s.scheduled_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor[s.status] ?? "bg-gray-100 text-gray-800"}`}>{s.status}</span>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{s.notes ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t px-4 py-2 text-xs text-muted-foreground">
            Showing {filtered.length} of {schedules.length} record{schedules.length === 1 ? "" : "s"}
            {selectedCount > 0 && <span className="ml-2 font-medium text-foreground">· {selectedCount} selected</span>}
          </div>
        </div>
      )}

      {/* Bulk delete selected */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} schedule{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{selectedCount} selected record{selectedCount === 1 ? "" : "s"}</strong> from the database. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 mr-2" />Yes, delete {selectedCount === 1 ? "it" : "all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete ALL */}
      <AlertDialog open={confirmDeleteAllOpen} onOpenChange={setConfirmDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Delete all {schedules.length} schedule records?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently erase <strong>every schedule record</strong> in this dataset. There is no way to recover this data. Are you absolutely sure?
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
