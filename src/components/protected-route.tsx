import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;
  return <>{children}</>;
}
