import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, ChevronRight, Laptop, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface UpcomingRow {
  id: string;
  scheduled_date: string;
  status: string;
  laptops: { asset_tag: string; team_members: { name: string } | null } | null;
}

const Index = () => {
  const [counts, setCounts] = useState({ laptops: 0, members: 0, scheduled: 0 });
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [lp, tm, sc, up] = await Promise.all([
        supabase.from("laptops").select("id", { count: "exact", head: true }),
        supabase.from("team_members").select("id", { count: "exact", head: true }),
        supabase.from("schedules").select("id", { count: "exact", head: true }).gte("scheduled_date", today),
        supabase
          .from("schedules")
          .select("id,scheduled_date,status,laptops(asset_tag,team_members(name))")
          .gte("scheduled_date", today)
          .order("scheduled_date")
          .limit(8),
      ]);
      setCounts({
        laptops: lp.count ?? 0,
        members: tm.count ?? 0,
        scheduled: sc.count ?? 0,
      });
      setUpcoming((up.data as UpcomingRow[]) ?? []);
    })();
  }, []);

  const stats = [
    { label: "Laptops", value: counts.laptops, icon: Laptop, to: "/laptops" },
    { label: "Team members", value: counts.members, icon: Users, to: "/team" },
    { label: "Upcoming", value: counts.scheduled, icon: CalendarCheck, to: "/schedule" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your maintenance program.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon, to }) => (
          <Card key={label} className="shadow-soft">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="text-3xl font-semibold mt-1">{value}</div>
              </div>
              <Link to={to} className="h-10 w-10 grid place-items-center rounded-md bg-primary-muted text-primary">
                <Icon className="h-5 w-5" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Upcoming maintenance</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/schedule">Open schedule <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No upcoming maintenance. Generate a schedule to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 grid place-items-center rounded-md bg-accent text-accent-foreground text-xs font-medium">
                      {format(new Date(s.scheduled_date), "dd")}
                    </div>
                    <div>
                      <div className="font-medium font-mono text-sm">{s.laptops?.asset_tag}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.laptops?.team_members?.name ?? "Unassigned"} · {format(new Date(s.scheduled_date), "MMM d, yyyy")}
                      </div>
                    </div>
                  </div>
                  <Badge variant={s.status === "done" ? "secondary" : "outline"}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
