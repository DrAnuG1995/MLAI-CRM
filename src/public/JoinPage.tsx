import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { FORM, CORE_FIELDS, type Q } from "@/crm/shared/memberForm";
import kangaroo from "@/assets/mlai-kangaroo.png";

type Answers = Record<string, string | string[] | boolean | undefined>;

/**
 * Public member form — no login. Posted to Slack (#/join?src=slack) and the
 * Substack (#/join?src=substack). Writes one row to member_submissions; the
 * committee links it to a person from People → Form responses.
 */
export default function JoinPage() {
  const [params] = useSearchParams();
  const source = params.get("src") || "other";
  const [a, setA] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => FORM.filter((s) => !s.showIf || s.showIf(a)), [a]);
  const set = (id: string, v: Answers[string]) => setA((prev) => ({ ...prev, [id]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    for (const s of visible) for (const q of s.questions) {
      if (q.required && (a[q.id] === undefined || a[q.id] === "" || (Array.isArray(a[q.id]) && !(a[q.id] as string[]).length))) {
        setError(`Please answer "${q.label}".`);
        document.getElementById(`q-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    setBusy(true);
    const answers: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) if (!CORE_FIELDS.has(k) && v !== undefined && v !== "") answers[k] = v;
    const { error } = await supabase.from("member_submissions").insert({
      source,
      first_name: String(a.first_name || "").trim(),
      last_name: String(a.last_name || "").trim(),
      email: String(a.email || "").trim().toLowerCase(),
      phone: String(a.phone || "").trim() || null,
      slack_handle: String(a.slack_handle || "").trim() || null,
      answers,
    });
    setBusy(false);
    if (error) { setError("Something went wrong saving your answers — please try again in a moment."); return; }
    setDone(true);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-full bg-[#f9f7f2] text-[#0b0b0b]">
      <header className="bg-[#0b0b0b] px-6 py-8 text-white">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center gap-3">
            <img src={kangaroo} alt="" className="h-12 w-12" />
            <span className="text-lg font-bold tracking-tight">MLAI</span>
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Tell us about you</h1>
          <p className="mt-2 max-w-xl text-white/80">
            Two minutes. It helps the committee run better events, connect the right people, and find the mentors, speakers and volunteers who make MLAI work.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {done ? (
          <div className="rounded-2xl bg-[#f9f6f4] p-8 text-center shadow-sm ring-1 ring-black/5">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#00ffd7] text-2xl text-black">✓</div>
            <h2 className="text-xl font-bold text-[#008080]">Thanks — you're in.</h2>
            <p className="mt-2 text-gray-600">We'll only reach out about the things you ticked. See you at the next meetup.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-6" noValidate>
            {visible.map((s) => (
              <section key={s.title} className="rounded-2xl bg-[#f9f6f4] p-6 shadow-sm ring-1 ring-black/5">
                <h2 className="text-lg font-bold text-[#008080]">{s.title}</h2>
                {s.blurb && <p className="mt-1 text-sm text-gray-600">{s.blurb}</p>}
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  {s.questions.map((q) => <Field key={q.id} q={q} value={a[q.id]} onChange={(v) => set(q.id, v)} />)}
                </div>
              </section>
            ))}
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-gray-500">Your details are only seen by the MLAI committee and never sold or shared.</p>
              <button type="submit" disabled={busy} className="rounded-lg bg-[#008080] px-6 py-3 font-semibold text-white hover:bg-[#008080]/90 disabled:opacity-50">
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-[#008080] focus:outline-none focus:ring-2 focus:ring-[#008080]/20";

function Field({ q, value, onChange }: { q: Q; value: Answers[string]; onChange: (v: Answers[string]) => void }) {
  const wide = q.type === "textarea" || q.type === "multi" || (q.type === "yesno") || q.id === "email";
  const label = (
    <label htmlFor={`q-${q.id}`} className="mb-1 block text-sm font-medium text-gray-800">
      {q.label}{q.required && <span className="text-red-500"> *</span>}
    </label>
  );
  const hint = "hint" in q && q.hint ? <p className="mt-1 text-xs text-gray-500">{q.hint}</p> : null;

  if (q.type === "select") {
    return (
      <div className={wide ? "sm:col-span-2" : ""}>{label}
        <select id={`q-${q.id}`} className={inputCls} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>{hint}
      </div>
    );
  }
  if (q.type === "multi") {
    const sel = (value as string[]) ?? [];
    const toggle = (o: string) => {
      if (sel.includes(o)) onChange(sel.filter((x) => x !== o));
      else if (!q.max || sel.length < q.max) onChange([...sel, o]);
    };
    return (
      <div className="sm:col-span-2">{label}
        <div className="flex flex-wrap gap-2">
          {q.options.map((o) => {
            const on = sel.includes(o);
            return (
              <button type="button" key={o} onClick={() => toggle(o)} aria-pressed={on}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? "border-[#008080] bg-[#008080] text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"}`}>
                {o}
              </button>
            );
          })}
        </div>
        {q.max && <p className="mt-1 text-xs text-gray-500">Up to {q.max}.</p>}{hint}
      </div>
    );
  }
  if (q.type === "yesno") {
    return (
      <div className="sm:col-span-2">{label}
        <div className="flex gap-2">
          {[["Yes", true], ["No", false]].map(([l, v]) => (
            <button type="button" key={String(l)} onClick={() => onChange(v as boolean)} aria-pressed={value === v}
              className={`rounded-full border px-4 py-1.5 text-sm ${value === v ? "border-[#008080] bg-[#008080] text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"}`}>
              {l as string}
            </button>
          ))}
        </div>{hint}
      </div>
    );
  }
  if (q.type === "textarea") {
    return (
      <div className="sm:col-span-2">{label}
        <textarea id={`q-${q.id}`} className={inputCls} rows={3} value={String(value ?? "")} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} />{hint}
      </div>
    );
  }
  return (
    <div className={wide ? "sm:col-span-2" : ""}>{label}
      <input id={`q-${q.id}`} type={q.type} className={inputCls} value={String(value ?? "")} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} autoComplete={q.id === "email" ? "email" : q.id === "phone" ? "tel" : q.id === "first_name" ? "given-name" : q.id === "last_name" ? "family-name" : "off"} />{hint}
    </div>
  );
}
