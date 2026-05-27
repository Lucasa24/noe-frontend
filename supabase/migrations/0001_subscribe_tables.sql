create table if not exists public.subscribers (
  email text primary key,
  status text not null default 'pending',
  token_hash text,
  source text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirm_ip text,
  confirm_ua text
);

create index if not exists subscribers_token_hash_idx
  on public.subscribers(token_hash);

create table if not exists public.events (
  id bigserial primary key,
  email text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_email_idx
  on public.events(email);

create index if not exists events_event_type_idx
  on public.events(event_type);

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key, window_start)
);
