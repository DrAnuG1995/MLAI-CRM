import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Profile } from "../types";

export function useCurrentUser() {
  const query = useQuery({
    queryKey: ["current-user"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return (data as Profile | null) ?? { id: user.id, email: user.email ?? null, full_name: null, role: "member" as const, created_at: "" };
    },
  });
  return { profile: query.data ?? null, isAdmin: query.data?.role === "admin", ...query };
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data as Profile[];
    },
  });
}
