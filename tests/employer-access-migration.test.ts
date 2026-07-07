import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMPLOYER_ACCESS_REQUEST_STATUSES } from "@/lib/types";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260706000000_employer_access_requests.sql",
  ),
  "utf8",
);

const reviewFunction = sql.match(
  /create or replace function public\.review_employer_access_request[\s\S]*?\$\$;/i,
)?.[0];

describe("employer access request migration", () => {
  it("creates the requests table with requester and review bookkeeping", () => {
    expect(sql).toMatch(/create table public\.employer_access_requests/i);
    expect(sql).toMatch(
      /requester_id uuid not null references public\.profiles \(id\) on delete cascade/i,
    );
    expect(sql).toMatch(/business_name text not null/i);
    expect(sql).toMatch(/contact_name text not null/i);
    expect(sql).toMatch(/city text not null/i);
    expect(sql).toMatch(/state text not null default 'CA'/i);
    expect(sql).toMatch(/status text not null default 'pending'/i);
    expect(sql).toMatch(
      /reviewed_by uuid references public\.profiles \(id\) on delete set null/i,
    );
    expect(sql).toMatch(/reviewed_at timestamptz/i);
  });

  it("constrains statuses to the TypeScript status set", () => {
    const check = sql.match(
      /constraint\s+employer_access_requests_status_allowed[\s\S]*?status\s+in\s*\(([^)]*)\)/i,
    );
    expect(check).toBeTruthy();
    const values = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(values).toEqual([...EMPLOYER_ACCESS_REQUEST_STATUSES]);
  });

  it("requires non-empty business, contact, and city plus bounded field lengths", () => {
    expect(sql).toMatch(
      /employer_access_requests_business_name_not_empty[\s\S]*?length\(btrim\(business_name\)\)\s*>\s*0/i,
    );
    expect(sql).toMatch(
      /employer_access_requests_contact_name_not_empty[\s\S]*?length\(btrim\(contact_name\)\)\s*>\s*0/i,
    );
    expect(sql).toMatch(
      /employer_access_requests_city_not_empty[\s\S]*?length\(btrim\(city\)\)\s*>\s*0/i,
    );
    expect(sql).toMatch(
      /employer_access_requests_reason_max_length[\s\S]*?char_length\(reason\)\s*<=\s*1000/i,
    );
    expect(sql).toMatch(
      /employer_access_requests_phone_max_length[\s\S]*?char_length\(phone\)\s*<=\s*40/i,
    );
    expect(sql).toMatch(
      /employer_access_requests_website_max_length[\s\S]*?char_length\(website\)\s*<=\s*2048/i,
    );
    expect(sql).toMatch(
      /employer_access_requests_review_fields_consistent/i,
    );
  });

  it("allows only one pending request per requester and indexes the queue", () => {
    expect(sql).toMatch(
      /create unique index employer_access_requests_one_pending_per_requester\s+on public\.employer_access_requests \(requester_id\)\s+where status = 'pending'/i,
    );
    expect(sql).toMatch(/create index employer_access_requests_status_created_idx/i);
    expect(sql).toMatch(/create index employer_access_requests_requester_created_idx/i);
    expect(sql).toMatch(/create trigger employer_access_requests_set_updated_at/i);
  });

  it("enables RLS and limits inserts to a seeker filing for themselves", () => {
    expect(sql).toMatch(
      /alter table public\.employer_access_requests enable row level security/i,
    );
    const policy = sql.match(
      /create policy employer_access_requests_insert_own[\s\S]*?;/i,
    )?.[0];
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/for insert/i);
    expect(policy).toMatch(/requester_id = auth\.uid\(\)/i);
    expect(policy).toMatch(/public\.current_profile_role\(\)\s*=\s*'seeker'/i);
    expect(policy).toMatch(/status = 'pending'/i);
    expect(policy).toMatch(/reviewed_by is null/i);
    expect(policy).toMatch(/reviewed_at is null/i);
  });

  it("lets requesters read only their own requests and admins read all", () => {
    const own = sql.match(
      /create policy employer_access_requests_select_own[\s\S]*?;/i,
    )?.[0];
    expect(own).toBeTruthy();
    expect(own).toMatch(/for select using \(requester_id = auth\.uid\(\)\)/i);

    const admin = sql.match(
      /create policy employer_access_requests_select_admin[\s\S]*?;/i,
    )?.[0];
    expect(admin).toBeTruthy();
    expect(admin).toMatch(/for select using \(public\.is_admin\(\)\)/i);
  });

  it("gives requesters no update or delete path through policies", () => {
    const policies = sql.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(policies.length).toBe(3);
    for (const statement of policies) {
      expect(statement).not.toMatch(/for\s+update/i);
      expect(statement).not.toMatch(/for\s+delete/i);
    }
  });

  it("reviews requests through an admin-only SECURITY DEFINER function", () => {
    expect(reviewFunction).toBeTruthy();
    expect(reviewFunction).toMatch(/security definer/i);
    expect(reviewFunction).toMatch(/set search_path = ''/i);
    expect(reviewFunction).toMatch(
      /auth\.uid\(\) is null or not public\.is_admin\(\)/i,
    );
    expect(reviewFunction).toMatch(/raise exception 'Only an admin/i);
    expect(reviewFunction).toMatch(/decision not in \('approved', 'rejected'\)/i);
    expect(reviewFunction).toMatch(/reviewed_by = auth\.uid\(\)/i);
    expect(reviewFunction).toMatch(/reviewed_at = now\(\)/i);
    expect(reviewFunction).toMatch(/return 'conflict'/i);
  });

  it("promotes seeker to employer only inside the approval branch", () => {
    const approvalBlock = reviewFunction!.match(
      /if decision = 'approved' then([\s\S]*?)end if;/i,
    )?.[1];
    expect(approvalBlock).toBeTruthy();
    expect(approvalBlock).toMatch(/update public\.profiles/i);
    expect(approvalBlock).toMatch(/set role = 'employer'/i);
    expect(approvalBlock).toMatch(/role = 'seeker'/i);

    // The rejection path must never touch profiles: the only profiles update
    // in the whole migration is the one in the approval branch above.
    const profileUpdates = sql.match(/update public\.profiles/gi) ?? [];
    expect(profileUpdates.length).toBe(1);
  });

  it("locks review function execution to authenticated callers", () => {
    expect(sql).toMatch(
      /revoke all on function public\.review_employer_access_request\(uuid, text\) from public, anon, authenticated/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.review_employer_access_request\(uuid, text\) to authenticated/i,
    );
  });
});
