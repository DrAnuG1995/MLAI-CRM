import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import kangaroo from "@/assets/mlai-kangaroo.png";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[#0b0b0b] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#f9f7f2] p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img src={kangaroo} alt="MLAI" className="mx-auto mb-3 h-16 w-16" />
          <div className="text-lg font-semibold tracking-tight text-[#008080]">MLAI CRM</div>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage the community</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full bg-[#008080] hover:bg-[#008080]/90">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Committee accounts are created in Supabase (Authentication → Users).
        </p>
      </div>
    </div>
  );
}
