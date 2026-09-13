#!/usr/bin/env python3
"""Turn supabase/seed/mlai-slack-members.csv (read off the Slack #general
member list) into SQL for the people/organisations tables.

  python3 scripts/import-slack-members.py > /tmp/import.sql
  supabase db query --linked -f /tmp/import.sql

Idempotent: rows are skipped if a person with the same slack_handle already
exists. Committee members named below get type=organiser + the 'committee'
tag; everyone else is a plain member tagged 'slack-import'.
"""
import csv, sys, pathlib

CSV = pathlib.Path(__file__).resolve().parent.parent / "supabase/seed/mlai-slack-members.csv"
NOTE = "Imported from Slack #general member list, 13 Sep 2026"

COMMITTEE = {  # slack display name -> role title to record
    "Dr Sam": "President",
    "Michael Reitzenstein": "Vice President",
    "Lukas Wesemann": "Co-founder, Secretary",
    "Pegah Khaleghi": "Treasurer",
    "Ryan": ("Ryan Mouritz", "VP Community & Operations"),  # display name is ambiguous; match on full name
    "Yana": "Head of Marketing",
    "Anurag Ganugapati (you)": "Committee",
}
ORGS = {  # organisation -> (kind, [display-name substrings that belong to it])
    "Stone & Chalk": ("venue", ["Stone and Chalk"]),
    "Monash DeepNeuron": ("partner", ["Monash DeepNeuron"]),
    "HEX": ("partner", ["- HEX", "Ashwin - HEX", "Jeanette - HEX"]),
}

def q(s):  # SQL string literal
    return "NULL" if s is None or s == "" else "'" + s.replace("'", "''") + "'"

rows = list(csv.DictReader(open(CSV, encoding="utf-8")))
out = ["begin;"]
for name, (kind, _) in ORGS.items():
    out.append(f"insert into public.organisations (name, kind, status, notes) select {q(name)}, {q(kind)}, 'active', {q(NOTE)} "
               f"where not exists (select 1 from public.organisations where name = {q(name)});")

for r in rows:
    disp, full, title = r["display_name"].strip(), r["full_name"].strip(), r["title"].strip()
    handle = disp.replace(" (you)", "")
    name = full or handle
    ptype, tags, role = "member", ["slack-import"], title or None
    c = COMMITTEE.get(disp)
    if isinstance(c, tuple):
        c = c[1] if full == c[0] else None
    if c:
        ptype, tags, role = "organiser", ["slack-import", "committee"], c
    org = next((o for o, (_, keys) in ORGS.items() if any(k in disp for k in keys)), None)
    org_sql = f"(select id from public.organisations where name = {q(org)} limit 1)" if org else "NULL"
    tags_sql = "array[" + ",".join(q(t) for t in tags) + "]::text[]"
    out.append(
        f"insert into public.people (full_name, slack_handle, role_title, type, status, tags, organisation_id, notes) "
        f"select {q(name)}, {q(handle)}, {q(role)}, {q(ptype)}, 'active', {tags_sql}, {org_sql}, {q(NOTE)} "
        f"where not exists (select 1 from public.people where slack_handle = {q(handle)} and full_name = {q(name)});"
    )
out.append("commit;")
out.append("select type, count(*) from public.people group by type order by 2 desc;")
print("\n".join(out))
