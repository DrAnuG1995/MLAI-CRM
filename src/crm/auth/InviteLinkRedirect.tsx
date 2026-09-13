import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

// Supabase invite / recovery links land on the site root with the tokens in
// the URL fragment (…/#access_token=…&type=invite). supabase-js consumes the
// fragment and creates the session; we remember the link type before the
// HashRouter sees it, then send the person to set their password — once.
// (supabase-js re-emits SIGNED_IN every time the tab regains focus, so the
// redirect must not be tied to the event itself.)
const initialType = (() => {
  try {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return new URLSearchParams(hash).get("type");
  } catch {
    return null;
  }
})();
let handled = false;

export function InviteLinkRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    if (handled || (initialType !== "invite" && initialType !== "recovery" && initialType !== "magiclink")) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (handled || !session) return;
      handled = true;
      navigate("/onboarding", { replace: true });
      sub.subscription.unsubscribe();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);
  return null;
}
