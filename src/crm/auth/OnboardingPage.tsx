import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import kangaroo from "@/assets/mlai-kangaroo.png";

/** Reached from an invite or password-reset email: set a password, then in. */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
      setName((user?.user_metadata?.full_name as string) ?? "");
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return toast.error("Use at least 10 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password, data: { full_name: name.trim() || undefined } });
    if (!error && name.trim()) await supabase.from("profiles").update({ full_name: name.trim() }).eq("id", (await supabase.auth.getUser()).data.user!.id);
    setBusy(false);
    if (error) return toast.error(`Couldn't set password: ${error.message}`);
    toast.success("You're in");
    navigate("/dashboard", { replace: true });
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-[#0b0b0b] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#f9f7f2] p-8 shadow-xl">
        <div className="mb-6 text-center">
          <img src={kangaroo} alt="MLAI" className="mx-auto mb-3 h-16 w-16" />
          <div className="text-lg font-semibold tracking-tight text-[#008080]">Welcome to the MLAI CRM</div>
          <p className="mt-1 text-sm text-muted-foreground">{email ? `Set a password for ${email}` : "Checking your invite…"}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="name">Your name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw2">Confirm password</Label><Input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
          <Button type="submit" disabled={busy || !email} className="w-full bg-[#008080] hover:bg-[#008080]/90">{busy ? "Saving…" : "Set password and continue"}</Button>
        </form>
      </div>
    </div>
  );
}
