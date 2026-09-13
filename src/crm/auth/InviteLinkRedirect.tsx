import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

// Supabase invite / recovery links land on the site root with the tokens in
// the URL fragment (…/#access_token=…&type=invite). supabase-js consumes the
// fragment and creates the session; we remember the link type before the
// HashRouter sees it, then send the person to set their password.
const initialType = (() => {
  try {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return new URLSearchParams(hash).get("type");
  } catch {
    return null;
  }
})();

export function InviteLinkRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    if (initialType !== "invite" && initialType !== "recovery" && initialType !== "magiclink") return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION")) {
        navigate("/onboarding", { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  return null;
}
