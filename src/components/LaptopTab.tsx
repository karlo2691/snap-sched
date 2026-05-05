import { useState } from "react";
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
import { Laptop, Plus, Download, Pencil, Loader2 } from "lucide-react";

// ─── Schema ──────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

interface LaptopTabProps {
  ownerId: string;
}

export function LaptopTab({ ownerId }: LaptopTabProps) {
  const queryClient = useQueryClient();
  const { triggerSync, downloadExcel, isSyncing } = useLaptopExcelSync();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLaptop, setEditingLaptop] = useState<LaptopRow | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: laptops = [], isLoading: laptopsLoading } = useQuery({
    queryKey: ["laptops", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("laptops")
        .select(
          `
          id, asset_tag, model, team, assigned_member_id, owner_id, created_at,
          team_members ( id, name, email )
        `
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

  // ── Form ───────────────────────────────────────────────────────────────────

  const form = useForm<LaptopFormValues>({
    resolver: zodResolver(laptopSchema),
    defaultValues: {
      asset_tag: "",
      model: "",
      team: "",
      assigned_member_id: null,
    },
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

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (values: LaptopFormValues) => {
      const { data, error } = await supabase
        .from("laptops")
        .insert({
          asset_tag: values.asset_tag,
          model: values.model || null,
          team: values.team || null,
          // ✅ Capture the assigned_member_id (owner field) on creation
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

      // ✅ Programmatically trigger Excel sync — captures assigned owner
      await triggerSync(ownerId, true);
    },
    onError: (err: Error) => {
      toast.error("Failed to add laptop", { description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: LaptopFormValues) => {
      if (!editingLaptop) throw new Error("No laptop selected");

      const { data, error } = await supabase
        .from("laptops")
        .update({
          asset_tag: values.asset_tag,
          model: values.model || null,
          team: values.team || null,
          // ✅ Capture updated assigned_member_id (owner field) on update
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

      // ✅ Programmatically trigger Excel sync — writes updated owner to Excel
      await triggerSync(ownerId, true);
    },
    onError: (err: Error) => {
      toast.error("Failed to update laptop", { description: err.message });
    },
  });

  const onSubmit = (values: LaptopFormValues) => {
    if (editingLaptop) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Laptop className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-medium">Laptops</h2>
          <Badge variant="secondary">{laptops.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* ✅ Download button — generates Excel with assigned owner column */}
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

          {/* Add laptop dialog */}
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
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="space-y-4"
                >
                  {/* Asset Tag */}
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

                  {/* Model */}
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

                  {/* Team */}
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

                  {/* ✅ Assigned Owner — this field is captured and written to Excel */}
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

      {/* Table */}
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
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Tag</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Team</TableHead>
                {/* ✅ Assigned Owner column — mirrors the Excel column */}
                <TableHead>Assigned Owner</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {laptops.map((laptop) => {
                const member = Array.isArray(laptop.team_members)
                  ? laptop.team_members[0]
                  : laptop.team_members;

                return (
                  <TableRow key={laptop.id}>
                    <TableCell className="font-mono text-sm">
                      {laptop.asset_tag}
                    </TableCell>
                    <TableCell>{laptop.model ?? "—"}</TableCell>
                    <TableCell>{laptop.team ?? "—"}</TableCell>
                    {/* ✅ Shows the captured assigned owner */}
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
        </div>
      )}
    </div>
  );
}
