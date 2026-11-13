-- v4 additions (run once after schema.sql): CSAT, canned responses
alter table conversations add column if not exists csat_requested boolean default false;
create table if not exists csat(conversation_id uuid primary key references conversations on delete cascade, account_id uuid not null references accounts on delete cascade, score int check (score between 1 and 5), comment text, created_at timestamptz default now());
create table if not exists canned_responses(id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts on delete cascade, shortcode text not null, body text not null, unique(account_id, shortcode));
alter table csat enable row level security; create policy tenant on csat for all using (is_member(account_id)) with check (is_member(account_id));
alter table canned_responses enable row level security; create policy tenant on canned_responses for all using (is_member(account_id)) with check (is_member(account_id));
