-- Run this in Supabase SQL Editor

create table if not exists runs (
    id uuid primary key default gen_random_uuid(),
    user_id text not null default 'guest',
    created_at timestamptz not null default now(),
    brands text[] not null,
    queries text[] not null,
    models text[] not null
);

create table if not exists results (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references runs(id) on delete cascade,
    brand text not null,
    model text not null,
    score int not null,
    mentioned_count int not null,
    total_queries int not null,
    created_at timestamptz not null default now()
);

-- speeds up trend queries like "give me brand X's scores over time"
create index if not exists idx_results_brand_model on results(brand, model);
create index if not exists idx_results_run_id on results(run_id);
create index if not exists idx_runs_user_created on runs(user_id, created_at desc);