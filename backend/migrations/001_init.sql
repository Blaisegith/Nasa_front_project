-- ============================================================================
-- TechLabs — schéma Supabase PostgreSQL + Row Level Security
-- Version : 001
--
-- Source de vérité pour la production Supabase. En développement local et dans
-- les tests, SQLAlchemy crée les tables équivalentes (Base.metadata.create_all).
--
-- Conventions :
--   * identifiants UUID générés par l'application (gen_random_uuid côté SQL) ;
--   * user_id jamais fourni par le client, dérivé de la session serveur ;
--   * RLS activée sur toutes les tables privées, en « fail closed » :
--     si `app.user_id` n'est pas défini, aucune ligne n'est renvoyée.
--
-- Le backend se connecte avec un rôle applicatif et pose la variable de session
-- avant chaque transaction :
--     SET LOCAL app.user_id = '<uuid>';
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Utilisateurs, profils, sessions
-- ---------------------------------------------------------------------------
create table if not exists public.users (
    id            uuid primary key default gen_random_uuid(),
    email         text not null,
    created_at    timestamptz not null default now(),
    last_seen_at  timestamptz
);

create unique index if not exists users_email_key on public.users (lower(email));

create table if not exists public.profiles (
    user_id       uuid primary key references public.users(id) on delete cascade,
    display_name  text not null,
    bio           text not null default '',
    avatar_url    text,
    updated_at    timestamptz not null default now()
);

create table if not exists public.sessions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.users(id) on delete cascade,
    token_hash    text not null unique,
    created_at    timestamptz not null default now(),
    expires_at    timestamptz not null,
    revoked_at    timestamptz,
    ip_address    text,
    user_agent    text
);

create index if not exists sessions_user_id_idx on public.sessions (user_id);
create index if not exists sessions_token_hash_idx on public.sessions (token_hash);

-- ---------------------------------------------------------------------------
-- Conversations et messages
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.users(id) on delete cascade,
    title         text not null default 'Nouvelle conversation',
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    archived_at   timestamptz
);

create index if not exists conversations_user_updated_idx
    on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
    id                uuid primary key default gen_random_uuid(),
    conversation_id   uuid not null references public.conversations(id) on delete cascade,
    role              text not null check (role in ('user', 'assistant', 'system')),
    status            text not null default 'completed',
    content           jsonb not null default '{}'::jsonb,
    sequence          integer not null default 0,
    created_at        timestamptz not null default now()
);

create index if not exists messages_conversation_sequence_idx
    on public.messages (conversation_id, sequence);

-- ---------------------------------------------------------------------------
-- Réservé : documents privés, catalogue multimédia, journal d'ingestion
-- Ces tables existent pour que le RAG et le multimodal se branchent sans
-- migration destructive. Elles ne sont pas encore utilisées par l'API.
-- ---------------------------------------------------------------------------
create table if not exists public.user_documents (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.users(id) on delete cascade,
    title         text not null,
    mime          text,
    size_bytes    bigint,
    storage_path  text,
    checksum      text,
    collection    text not null default 'user_documents',
    created_at    timestamptz not null default now()
);

create index if not exists user_documents_user_idx on public.user_documents (user_id);

create table if not exists public.media_assets (
    id                  uuid primary key default gen_random_uuid(),
    media_type          text not null check (media_type in ('image', 'video')),
    title               text not null,
    description         text,
    source              text,
    experiment          text,
    file_path           text,
    thumbnail_path      text,
    source_url          text,
    license             text,
    duration_seconds    numeric,
    timestamp_seconds   numeric,
    associated_document_id uuid references public.user_documents(id) on delete set null,
    metadata            jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now()
);

create index if not exists media_assets_type_idx on public.media_assets (media_type);
create index if not exists media_assets_experiment_idx on public.media_assets (experiment);

create table if not exists public.ingestion_runs (
    id            uuid primary key default gen_random_uuid(),
    kind          text not null,
    status        text not null default 'pending',
    stats         jsonb not null default '{}'::jsonb,
    started_at    timestamptz not null default now(),
    finished_at   timestamptz
);

-- ---------------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
    before update on public.conversations
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users           enable row level security;
alter table public.profiles        enable row level security;
alter table public.sessions        enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.user_documents  enable row level security;
alter table public.media_assets    enable row level security;
alter table public.ingestion_runs  enable row level security;

-- helper : identifiant courant, ou NULL si la variable n'est pas posée.
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
    select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- users ---------------------------------------------------------------------
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
    for select using (id = public.current_user_id());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
    for update using (id = public.current_user_id()) with check (id = public.current_user_id());

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
    for select using (user_id = public.current_user_id());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
    for update using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());

-- sessions ------------------------------------------------------------------
drop policy if exists sessions_select_own on public.sessions;
create policy sessions_select_own on public.sessions
    for select using (user_id = public.current_user_id());

-- conversations -------------------------------------------------------------
drop policy if exists conversations_select_own on public.conversations;
create policy conversations_select_own on public.conversations
    for select using (user_id = public.current_user_id());

drop policy if exists conversations_insert_own on public.conversations;
create policy conversations_insert_own on public.conversations
    for insert with check (user_id = public.current_user_id());

drop policy if exists conversations_update_own on public.conversations;
create policy conversations_update_own on public.conversations
    for update using (user_id = public.current_user_id())
    with check (user_id = public.current_user_id());

drop policy if exists conversations_delete_own on public.conversations;
create policy conversations_delete_own on public.conversations
    for delete using (user_id = public.current_user_id());

-- messages ------------------------------------------------------------------
drop policy if exists messages_select_own on public.messages;
create policy messages_select_own on public.messages
    for select using (
        exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
              and c.user_id = public.current_user_id()
        )
    );

drop policy if exists messages_insert_own on public.messages;
create policy messages_insert_own on public.messages
    for insert with check (
        exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
              and c.user_id = public.current_user_id()
        )
    );

-- user_documents ------------------------------------------------------------
drop policy if exists user_documents_select_own on public.user_documents;
create policy user_documents_select_own on public.user_documents
    for select using (user_id = public.current_user_id());

drop policy if exists user_documents_insert_own on public.user_documents;
create policy user_documents_insert_own on public.user_documents
    for insert with check (user_id = public.current_user_id());

drop policy if exists user_documents_delete_own on public.user_documents;
create policy user_documents_delete_own on public.user_documents
    for delete using (user_id = public.current_user_id());

-- media_assets : catalogue scientifique commun, lecture publique.
-- L'écriture est réservée au rôle de service (ingestion), pas au navigateur.
drop policy if exists media_assets_select_all on public.media_assets;
create policy media_assets_select_all on public.media_assets
    for select using (true);

-- ingestion_runs : administration uniquement, aucun accès applicatif.
drop policy if exists ingestion_runs_admin_only on public.ingestion_runs;
create policy ingestion_runs_admin_only on public.ingestion_runs
    for select using (false);

-- ---------------------------------------------------------------------------
-- Rôle applicatif (à exécuter une fois, hors Supabase Studio si nécessaire) :
--
--   create role techlabs_app login password '<mot de passe fort>';
--   grant usage on schema public to techlabs_app;
--   grant select, insert, update, delete on all tables in schema public to techlabs_app;
--
-- Le backend pose ensuite `app.user_id` par transaction. Sans cette variable,
-- la RLS ne renvoie aucune ligne : c'est le comportement voulu.
-- ---------------------------------------------------------------------------