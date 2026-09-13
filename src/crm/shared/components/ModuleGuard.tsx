import { Navigate, Outlet } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import type { AppModule } from "../types";

/**
 * Route-level gate: renders children only if the signed-in user can read
 * (or, with require="write", write) the module. RLS is the real boundary;
 * this keeps people out of pages that would just render empty.
 */
export default function ModuleGuard({ module, require = "read", redirectTo = "/dashboard", children }: {
  module: AppModule; require?: "read" | "write"; redirectTo?: string; children?: React.ReactNode;
}) {
  const { canRead, canWrite, isLoading, profile } = useCurrentUser();
  if (isLoading) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#008080] border-t-transparent" />
      </div>
    );
  }
  if (!profile) return <Navigate to="/login" replace />;
  const allowed = require === "write" ? canWrite(module) : canRead(module);
  if (!allowed) return <Navigate to={redirectTo} replace />;
  return children ? <>{children}</> : <Outlet />;
}
