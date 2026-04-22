import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

const credSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
});

const Auth = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const handle = async (e: React.FormEvent<HTMLFormElement>, mode: "signin" | "signup") => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = credSchema.safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: (fd.get("display_name") as string) || undefined },
          },
        });
        if (error) throw error;
        toast.success("Account created — you can sign in now.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;
        navigate("/");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-primary/10 via-background to-accent">
        <div className="flex items-center gap-2 font-semibold">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Wrench className="h-4 w-4" />
          </div>
          MaintainIQ
        </div>
        <div className="space-y-3 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Plan laptop maintenance with confidence.</h1>
          <p className="text-muted-foreground">
            Auto-generate balanced schedules, notify your team, and rearrange dates with a single drag.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} MaintainIQ</div>
      </div>

      <div className="flex flex-col">
        <div className="flex justify-end p-4"><ThemeToggle /></div>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="w-full max-w-md shadow-soft">
            <CardHeader>
              <CardTitle>Welcome</CardTitle>
              <CardDescription>Sign in or create your admin account.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>
                <TabsContent value="signin">
                  <form className="space-y-4 mt-4" onSubmit={(e) => handle(e, "signin")}>
                    <div className="space-y-2">
                      <Label htmlFor="email-in">Email</Label>
                      <Input id="email-in" name="email" type="email" required autoComplete="email" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pw-in">Password</Label>
                      <Input id="pw-in" name="password" type="password" required autoComplete="current-password" />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? "Signing in…" : "Sign in"}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form className="space-y-4 mt-4" onSubmit={(e) => handle(e, "signup")}>
                    <div className="space-y-2">
                      <Label htmlFor="name-up">Display name</Label>
                      <Input id="name-up" name="display_name" maxLength={80} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email-up">Email</Label>
                      <Input id="email-up" name="email" type="email" required autoComplete="email" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pw-up">Password</Label>
                      <Input id="pw-up" name="password" type="password" required autoComplete="new-password" minLength={8} />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {busy ? "Creating…" : "Create account"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Auth;
