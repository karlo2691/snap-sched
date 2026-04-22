import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isWeekend, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Mail, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { distributeWeekdays, formatDateISO, shuffle } from "@/lib/scheduling";
import { toast } from "sonner";

interface Laptop {
  id: string;
  asset_tag: string;
  model: string | null;
  team: string | null;
  assigned_member_id: string | null;
  team_members?: { name: string; email: string } | null;
}
interface Schedule {
  id: string;
  laptop_id: string;
  scheduled_date: string;
  status: string;
  notified_at: string | null;
  laptops?: { asset_tag: string; team_members?: { name: string; email: string } | null } | null;
}

function DraggableEvent({ s }: { s: Schedule }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: s.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "text-[11px] leading-tight px-1.5 py-1 rounded bg-primary/15 text-primary border border-primary/20 cursor-grab active:cursor-grabbing truncate select-none",
        isDragging && "opacity-50",
        s.status === "done" && "bg-success/15 text-success border-success/30",
      )}
      title={`${s.laptops?.asset_tag} — ${s.laptops?.team_members?.name ?? "Unassigned"}`}
    >
      {s.laptops?.asset_tag}
    </div>
  );
}

function DroppableDay({ date, currentMonth, items }: { date: Date; currentMonth: Date; items: Schedule[] }) {
  const id = formatDateISO(date);
  const { setNodeRef, isOver } = useDroppable({ id });
  const inMonth = isSameMonth(date, currentMonth);
  const today = isSameDay(date, new Date());
  const weekend = isWeekend(date);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-h-[92px] p-1.5 border border-border bg-card flex flex-col gap-1 transition-colors",
        !inMonth && "bg-muted/40 text-muted-foreground",
        weekend && "bg-muted/30",
        isOver && "ring-2 ring-primary ring-inset bg-accent",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs", today && "h-5 w-5 grid place-items-center rounded-full bg-primary text-primary-foreground font-medium")}>
          {date.getDate()}
        </span>
      </div>
      <div className="flex flex-col gap-1 overflow-hidden">
        {items.slice(0, 4).map((s) => <DraggableEvent key={s.id} s={s} />)}
        {items.length > 4 && (
          <span className="text-[10px] text-muted-foreground px-1">+{items.length - 4} more</span>
        )}
      </div>
    </div>
  );
}

const Schedule = () => {
  const { user } = useAuth();
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [genOpen, setGenOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(formatDateISO(new Date()));
  const [endDate, setEndDate] = useState(formatDateISO(addMonths(new Date(), 3)));
  const [notifyAdmin, setNotifyAdmin] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notifyingAll, setNotifyingAll] = useState(false);

  const load = async () => {
    const [{ data: lp }, { data: sc }] = await Promise.all([
      supabase.from("laptops").select("id,asset_tag,model,team,assigned_member_id,team_members(name,email)").order("asset_tag"),
      supabase.from("schedules").select("id,laptop_id,scheduled_date,status,notified_at,laptops(asset_tag,team_members(name,email))").order("scheduled_date"),
    ]);
    setLaptops((lp as Laptop[]) ?? []);
    setSchedules((sc as Schedule[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const days = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) }),
    [month],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Schedule[]>();
    for (const s of schedules) {
      const arr = map.get(s.scheduled_date) ?? [];
      arr.push(s);
      map.set(s.scheduled_date, arr);
    }
    return map;
  }, [schedules]);

  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    const newDate = e.over?.id ? String(e.over.id) : null;
    if (!newDate) return;
    const sched = schedules.find((s) => s.id === id);
    if (!sched || sched.scheduled_date === newDate) return;
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, scheduled_date: newDate } : s)));
    const { error } = await supabase.from("schedules").update({ scheduled_date: newDate }).eq("id", id);
    if (error) {
      toast.error(error.message);
      load();
    } else {
      toast.success(`Moved to ${newDate}`);
    }
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? laptops.map((l) => l.id) : []);
  };

  const generate = async () => {
    if (!user) return;
    if (selectedIds.length === 0) return toast.error("Select at least one laptop");
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return toast.error("End date must be after start date");

    setBusy(true);
    const dates = distributeWeekdays(start, end, selectedIds.length);
    if (dates.length === 0) {
      setBusy(false);
      return toast.error("No weekdays in the selected range");
    }
    const shuffled = shuffle(selectedIds);
    const rows = shuffled.map((laptopId, i) => ({
      owner_id: user.id,
      laptop_id: laptopId,
      scheduled_date: formatDateISO(dates[Math.min(i, dates.length - 1)]),
      status: "pending",
    }));
    const { error } = await supabase.from("schedules").insert(rows);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Generated ${rows.length} maintenance dates`);
    setGenOpen(false);
    await load();

    if (notifyAdmin) {
      void supabase.functions.invoke("send-schedule-summary", {
        body: { adminEmail: user.email, count: rows.length, startDate, endDate },
      });
    }
  };

  const notifyAll = async () => {
    setNotifyingAll(true);
    const { error } = await supabase.functions.invoke("notify-team-schedules", { body: {} });
    setNotifyingAll(false);
    if (error) return toast.error(error.message);
    toast.success("Notifications queued");
    load();
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" /> Maintenance schedule
            </h1>
            <p className="text-sm text-muted-foreground">Drag any event to reschedule it instantly.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={notifyAll} disabled={notifyingAll || schedules.length === 0}>
              {notifyingAll ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              Notify team
            </Button>
            <Dialog open={genOpen} onOpenChange={setGenOpen}>
              <DialogTrigger asChild>
                <Button><Sparkles className="h-4 w-4 mr-2" />Generate</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Generate schedule</DialogTitle>
                  <DialogDescription>Randomly distribute the selected laptops across weekdays in your date range.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="start">Start date</Label>
                      <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end">End date</Label>
                      <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Laptops ({selectedIds.length}/{laptops.length})</Label>
                      <div className="flex gap-2 text-xs">
                        <button type="button" className="text-primary hover:underline" onClick={() => toggleAll(true)}>Select all</button>
                        <button type="button" className="text-muted-foreground hover:underline" onClick={() => toggleAll(false)}>Clear</button>
                      </div>
                    </div>
                    <ScrollArea className="h-56 rounded-md border p-2">
                      {laptops.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Add laptops first.</p>}
                      <div className="space-y-1">
                        {laptops.map((l) => (
                          <label key={l.id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-accent cursor-pointer">
                            <Checkbox
                              checked={selectedIds.includes(l.id)}
                              onCheckedChange={(c) =>
                                setSelectedIds((prev) => (c ? [...prev, l.id] : prev.filter((x) => x !== l.id)))
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium font-mono">{l.asset_tag}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {l.team_members?.name ?? "Unassigned"} {l.team && `· ${l.team}`}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={notifyAdmin} onCheckedChange={(c) => setNotifyAdmin(!!c)} />
                    Email me a summary when generated
                  </label>
                </div>
                <DialogFooter>
                  <Button onClick={generate} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Generate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">{format(month, "MMMM yyyy")}</CardTitle>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setMonth((m) => subMonths(m, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
              <Button size="icon" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground mb-1">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => (
                <div key={d} className="px-2 py-1.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px rounded-md overflow-hidden border">
              {days.map((d) => (
                <DroppableDay key={d.toISOString()} date={d} currentMonth={month} items={byDay.get(formatDateISO(d)) ?? []} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-primary/20 border border-primary/40" />Pending</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-success/20 border border-success/40" />Done</span>
              <Badge variant="outline" className="ml-auto">{schedules.length} total</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </DndContext>
  );
};

export default Schedule;
