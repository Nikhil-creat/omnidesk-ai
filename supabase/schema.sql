-- OmniDesk full-stack schema: multi-tenant, RLS everywhere, pgvector hybrid search. Run once in Supabase SQL Editor.
create extension if not exists vector;
create table accounts(id uuid primary key default gen_random_uuid(), name text not null, slug text unique default substr(md5(random()::text),1,10), created_at timestamptz default now());
create table memberships(account_id uuid references accounts on delete cascade, user_id uuid references auth.users on delete cascade, role text default 'administrator', primary key(account_id,user_id));
create table contacts(id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts on delete cascade, name text, email text, memory jsonb default '[]', created_at timestamptz default now());
create table conversations(id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts on delete cascade, contact_id uuid references contacts on delete set null, session text, status text default 'pending' check (status in ('open','pending','resolved','snoozed')), priority text default 'medium' check (priority in ('low','medium','high','urgent')), sentiment text, channel text default 'widget', assignee uuid references auth.users, summary text, created_at timestamptz default now(), updated_at timestamptz default now());
create table messages(id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts on delete cascade, conversation_id uuid not null references conversations on delete cascade, sender text not null check (sender in ('contact','agent','bot','note')), body text not null, meta jsonb default '{}', created_at timestamptz default now());
create table kb_docs(id uuid primary key default gen_random_uuid(), account_id uuid not null references accounts on delete cascade, title text, created_at timestamptz default now());
create table kb_chunks(id bigserial primary key, account_id uuid not null references accounts on delete cascade, doc_id uuid references kb_docs on delete cascade, body text, embedding vector(768), tsv tsvector generated always as (to_tsvector('english', body)) stored);
create table audit_log(id bigserial primary key, account_id uuid references accounts on delete cascade, actor text, action text, detail jsonb, created_at timestamptz default now());
create index on kb_chunks using hnsw (embedding vector_cosine_ops);
create index on kb_chunks using gin (tsv);
create index on messages(conversation_id, created_at);
create index on conversations(account_id, updated_at desc);
create or replace function is_member(a uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from memberships where account_id=a and user_id=auth.uid()) $$;
do $$ declare t text; begin
  foreach t in array array['contacts','conversations','messages','kb_docs','kb_chunks','audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant on %I for all using (is_member(account_id)) with check (is_member(account_id))', t);
  end loop;
end $$;
alter table accounts enable row level security; create policy member on accounts for select using (is_member(id));
alter table memberships enable row level security; create policy own on memberships for select using (user_id = auth.uid());
create or replace function bootstrap_account(n text) returns uuid language plpgsql security definer set search_path=public as $$
declare a uuid; begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  insert into accounts(name) values (left(n,80)) returning id into a;
  insert into memberships(account_id,user_id) values (a,auth.uid());
  insert into audit_log(account_id,actor,action) values (a,auth.uid()::text,'workspace.created'); return a; end $$;
-- Hybrid retrieval: dense (cosine) + sparse (ts_rank_cd) fused by Reciprocal Rank Fusion, tenant-filtered. RLS still applies for user calls.
create or replace function match_chunks(acct uuid, q_emb vector(768) default null, q_text text default '', k int default 5)
returns table(id bigint, body text, score float) language sql stable as $$
  with dense as (select c.id, row_number() over (order by c.embedding <=> q_emb) r from kb_chunks c where c.account_id=acct and q_emb is not null and c.embedding is not null order by c.embedding <=> q_emb limit 25),
  sparse as (select c.id, row_number() over (order by ts_rank_cd(c.tsv, websearch_to_tsquery('english', q_text)) desc) r from kb_chunks c where c.account_id=acct and c.tsv @@ websearch_to_tsquery('english', q_text) limit 25),
  fused as (select coalesce(d.id,s.id) id, coalesce(1.0/(60+d.r),0)+coalesce(1.0/(60+s.r),0) score from dense d full join sparse s on d.id=s.id)
  select c.id, c.body, f.score::float from fused f join kb_chunks c on c.id=f.id order by f.score desc limit k $$;
alter publication supabase_realtime add table messages, conversations;
