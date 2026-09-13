/**
 * The member form, defined once so the public page renders it and the CRM's
 * review page can label every answer. Add a question here and both update.
 */
export type Q =
  | { id: string; label: string; type: "text" | "email" | "tel" | "url"; required?: boolean; placeholder?: string; hint?: string }
  | { id: string; label: string; type: "textarea"; required?: boolean; placeholder?: string; hint?: string }
  | { id: string; label: string; type: "select"; required?: boolean; options: string[]; hint?: string }
  | { id: string; label: string; type: "multi"; required?: boolean; options: string[]; hint?: string; max?: number }
  | { id: string; label: string; type: "yesno"; required?: boolean; hint?: string };

export interface Section { title: string; blurb?: string; questions: Q[]; showIf?: (a: Record<string, unknown>) => boolean }

export const OFFERS = ["Mentor other members", "Volunteer at events", "Give a talk or run a workshop", "Sponsor, or intro us to a sponsor", "Host an event at my workplace", "Write for the newsletter"];

export const FORM: Section[] = [
  {
    title: "About you",
    questions: [
      { id: "first_name", label: "First name", type: "text", required: true },
      { id: "last_name", label: "Surname", type: "text", required: true },
      { id: "email", label: "Email", type: "email", required: true, hint: "We'll use this to match you to your Slack account." },
      { id: "phone", label: "Phone", type: "tel", placeholder: "04…", hint: "Optional. Only used for event-day logistics." },
      { id: "slack_handle", label: "Your name on Slack", type: "text", hint: "As it appears in the MLAI Slack, so we can link your profile." },
      { id: "linkedin", label: "LinkedIn", type: "url", placeholder: "https://linkedin.com/in/…" },
      { id: "gender", label: "Gender", type: "select", options: ["Woman", "Man", "Non-binary", "Prefer to self-describe", "Prefer not to say"], hint: "Optional. Helps us track how representative our events and speakers are." },
      { id: "location", label: "Where are you based?", type: "select", required: true, options: ["Melbourne", "Sydney", "Brisbane", "Canberra", "Adelaide", "Perth", "Regional Australia", "Outside Australia"] },
      { id: "role_title", label: "Current role", type: "text", placeholder: "e.g. ML Engineer, PhD student, Founder" },
      { id: "organisation", label: "Organisation", type: "text", placeholder: "Company, university or 'independent'" },
      { id: "persona", label: "Which best describes you?", type: "select", required: true, options: ["Student", "Researcher / academic", "Engineer / developer", "Data scientist / analyst", "Product / design", "Founder", "Executive / manager", "Investor", "Other"] },
    ],
  },
  {
    title: "AI and you",
    questions: [
      { id: "ai_level", label: "How would you rate your AI/ML experience?", type: "select", required: true, options: ["Just getting started", "Comfortable using AI tools", "Build with AI regularly", "Expert — I train or research models"] },
      { id: "ai_use", label: "How do you use AI today?", type: "multi", options: ["Building AI products", "Research", "AI tools in my day job", "Learning / studying", "Advising or investing", "Not yet — curious"] },
      { id: "interests", label: "Topics you want more of", type: "multi", max: 5, options: ["LLMs & agents", "Computer vision", "Robotics", "MLOps & infrastructure", "Data engineering", "AI safety & policy", "Healthcare AI", "Fintech", "Climate & energy", "Education", "Creative & media", "Hardware & edge"] },
    ],
  },
  {
    title: "Startups",
    questions: [
      { id: "startup_status", label: "Your startup situation", type: "select", required: true, options: ["Founder of a current startup", "Early employee at a startup", "Founded one previously", "Thinking about starting one", "Not for me right now"] },
    ],
  },
  {
    title: "Your startup",
    showIf: (a) => ["Founder of a current startup", "Early employee at a startup", "Founded one previously"].includes(String(a.startup_status)),
    questions: [
      { id: "startup_name", label: "Startup name", type: "text" },
      { id: "startup_stage", label: "Stage", type: "select", options: ["Idea", "Pre-seed", "Seed", "Series A+", "Bootstrapped & profitable", "Exited / wound down"] },
      { id: "startup_desc", label: "What does it do?", type: "textarea", placeholder: "One or two sentences" },
      { id: "startup_needs", label: "What would help most right now?", type: "multi", options: ["Customers", "Investors", "A co-founder", "Hiring", "Technical advice", "Go-to-market advice", "Nothing — just here to help others"] },
    ],
  },
  {
    title: "Getting involved",
    blurb: "MLAI runs on members giving a little back. Tick anything you'd be open to — no commitment yet.",
    questions: [
      { id: "offers", label: "I'd be open to…", type: "multi", options: OFFERS },
      { id: "talk_topic", label: "If you'd give a talk: what on?", type: "text", placeholder: "e.g. Shipping agents in production, lessons from…" },
      { id: "wants", label: "What do you want from MLAI?", type: "multi", options: ["Meet people in AI", "Learn", "Find a job", "Hire", "Find a co-founder", "Meet investors", "Find customers", "Stay across what's happening"] },
      { id: "hiring", label: "Are you hiring right now?", type: "yesno" },
      { id: "open_to_work", label: "Are you open to new roles?", type: "yesno" },
      { id: "events", label: "Which events would you come to?", type: "multi", options: ["Monthly meetup", "Technical workshops", "Hackathons", "Founder dinners", "Co-working days", "Online talks"] },
    ],
  },
  {
    title: "Last bits",
    questions: [
      { id: "directory_ok", label: "Happy to appear in a members-only directory (name, role, interests)?", type: "yesno", required: true },
      { id: "contact_ok", label: "OK for the committee to contact you about the things you ticked?", type: "yesno", required: true },
      { id: "anything", label: "Anything else? Ideas, feedback, someone we should meet…", type: "textarea" },
    ],
  },
];

export const ALL_QUESTIONS: Q[] = FORM.flatMap((s) => s.questions);
export const CORE_FIELDS = new Set(["first_name", "last_name", "email", "phone", "slack_handle"]);
