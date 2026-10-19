-- BillShield reviews: smaller first version of the owner's hand-drawn data model (D-033).
-- Tables: bills, line_items, expectations, findings, messages, message_events.
-- Users are Supabase anonymous auth users (auth.users). No bill files or OCR text are stored.
-- Every row carries user_id; row level security lets each user see and add only their own rows.
-- Deferred: finding_lines and message_lines (line IDs are kept as arrays for now), chat_turns, deletion.

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  currency text not null check (currency in ('EUR', 'INR')),
  decimal_separator text not null check (decimal_separator in ('.', ',')),
  document_kind text not null default 'confirmed_review',
  provider text,                                  -- optional; not collected yet
  created_at timestamptz not null default now()
);

create table public.line_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_line_id text not null,                   -- the ID used in the page and in findings/messages
  description text not null,
  role text not null check (role in ('charge', 'discount', 'adjustment', 'subtotal', 'total')),
  group_label text,
  amount_minor bigint not null,                   -- confirmed amount in cents/paise, parsed by Python
  raw_amount text not null,                       -- as confirmed by the person
  extracted_raw_amount text,                      -- as first read by the extractor (null if typed)
  extractor text not null,
  corrected boolean,
  source_page int not null,
  source_precision text not null check (source_precision in ('exact', 'table', 'page')),
  source_located_by text,
  source_box jsonb,                               -- exact bounds or table region, never invented
  row_columns jsonb,                              -- printed quantity / unit price / discount / taxable value / taxes
  unique (bill_id, client_line_id)
);

create table public.expectations (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expected_minor bigint not null,
  source text not null default 'user-entered',
  effective_date date,                            -- optional: when the price was promised
  recorded_at timestamptz not null default now()  -- a change is a new row, never an overwrite
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  expectation_id uuid references public.expectations (id) on delete set null,
  verdict text not null check (verdict in ('verified_mismatch', 'unexplained', 'checks_passed')),
  arithmetic_status text not null,
  comparison_status text not null,
  calculated_total_minor bigint not null,
  printed_total_minor bigint,
  difference_minor bigint,
  calculation jsonb not null,                     -- formulas, group checks, row checks, exact matches
  missing_info text[] not null default '{}',
  supporting_line_ids text[] not null default '{}',
  ai_explanation jsonb,                           -- validated suggestion only; never numbers
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  draft_text text not null,
  message_type text not null,
  line_ids text[] not null default '{}',          -- lines the message is about (message_lines later)
  ai_question text,
  model text,
  created_at timestamptz not null default now()
);

create table public.message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  action text not null check (action in ('copied', 'sent')),
  final_text text,                                -- long numbers and e-mail addresses blanked before saving
  words_changed int check (words_changed >= 0),   -- null when no final text was given (unknown, not zero)
  created_at timestamptz not null default now()
);

-- Row level security: own rows only. No update or delete policies: history is append-only.
alter table public.bills enable row level security;
alter table public.line_items enable row level security;
alter table public.expectations enable row level security;
alter table public.findings enable row level security;
alter table public.messages enable row level security;
alter table public.message_events enable row level security;

create policy "own bills" on public.bills for select to authenticated using (user_id = (select auth.uid()));
create policy "add own bills" on public.bills for insert to authenticated with check (user_id = (select auth.uid()));

create policy "own lines" on public.line_items for select to authenticated using (user_id = (select auth.uid()));
create policy "add own lines" on public.line_items for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.bills b where b.id = bill_id and b.user_id = (select auth.uid())));

create policy "own expectations" on public.expectations for select to authenticated using (user_id = (select auth.uid()));
create policy "add own expectations" on public.expectations for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.bills b where b.id = bill_id and b.user_id = (select auth.uid())));

create policy "own findings" on public.findings for select to authenticated using (user_id = (select auth.uid()));
create policy "add own findings" on public.findings for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.bills b where b.id = bill_id and b.user_id = (select auth.uid())));

create policy "own messages" on public.messages for select to authenticated using (user_id = (select auth.uid()));
create policy "add own messages" on public.messages for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.findings f where f.id = finding_id and f.user_id = (select auth.uid())));

create policy "own events" on public.message_events for select to authenticated using (user_id = (select auth.uid()));
create policy "add own events" on public.message_events for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.messages m where m.id = message_id and m.user_id = (select auth.uid())));

create index on public.line_items (bill_id);
create index on public.expectations (bill_id);
create index on public.findings (bill_id);
create index on public.messages (finding_id);
create index on public.message_events (message_id);

-- Save one complete review in a single transaction (all rows or none). Runs with the caller's rights,
-- so the policies above still apply.
create or replace function public.save_review(review jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_bill uuid;
  new_expectation uuid;
  new_finding uuid;
  new_message uuid;
begin
  insert into bills (currency, decimal_separator)
  values (review->>'currency', review->>'decimal_separator')
  returning id into new_bill;

  insert into line_items (bill_id, client_line_id, description, role, group_label, amount_minor, raw_amount,
                          extracted_raw_amount, extractor, corrected, source_page, source_precision,
                          source_located_by, source_box, row_columns)
  select new_bill, l->>'client_line_id', l->>'description', l->>'role', l->>'group_label',
         (l->>'amount_minor')::bigint, l->>'raw_amount', l->>'extracted_raw_amount', l->>'extractor',
         (l->>'corrected')::boolean, (l->>'source_page')::int, l->>'source_precision',
         l->>'source_located_by', l->'source_box', l->'row_columns'
  from jsonb_array_elements(review->'lines') as l;

  if review->>'expected_minor' is not null then
    insert into expectations (bill_id, expected_minor) values (new_bill, (review->>'expected_minor')::bigint)
    returning id into new_expectation;
  end if;

  insert into findings (bill_id, expectation_id, verdict, arithmetic_status, comparison_status,
                        calculated_total_minor, printed_total_minor, difference_minor, calculation,
                        missing_info, supporting_line_ids, ai_explanation)
  values (new_bill, new_expectation, review->'finding'->>'verdict', review->'finding'->>'arithmetic_status',
          review->'finding'->>'comparison_status', (review->'finding'->>'calculated_total_minor')::bigint,
          (review->'finding'->>'printed_total_minor')::bigint, (review->'finding'->>'difference_minor')::bigint,
          review->'finding'->'calculation',
          array(select jsonb_array_elements_text(review->'finding'->'missing_info')),
          array(select jsonb_array_elements_text(review->'finding'->'supporting_line_ids')),
          review->'finding'->'ai_explanation')
  returning id into new_finding;

  insert into messages (finding_id, draft_text, message_type, line_ids, ai_question, model)
  values (new_finding, review->'message'->>'draft_text', review->'message'->>'message_type',
          array(select jsonb_array_elements_text(review->'message'->'line_ids')),
          review->'message'->>'ai_question', review->'message'->>'model')
  returning id into new_message;

  return jsonb_build_object('bill_id', new_bill, 'finding_id', new_finding, 'message_id', new_message);
end;
$$;

revoke all on function public.save_review(jsonb) from public, anon;
grant execute on function public.save_review(jsonb) to authenticated;

-- Explicit table access for signed-in (including anonymous) users; rows are still limited by the policies above.
grant select, insert on public.bills, public.line_items, public.expectations, public.findings,
  public.messages, public.message_events to authenticated;
revoke all on public.bills, public.line_items, public.expectations, public.findings,
  public.messages, public.message_events from anon;
