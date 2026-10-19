-- Nhịp online: class leaderboard on Supabase (PostgreSQL). Run once in Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only (re)creates the leaderboard objects.
--
-- Protection built in:
--   * Tables are closed to the public API (RLS on, no policies, privileges revoked); the app can only call the 4 functions below.
--   * Each class (room) has a seat limit (default 15); joining needs the class code.
--   * PINs are stored as bcrypt hashes; 5 wrong PINs lock that name for 15 minutes.
--   * Score updates are rate-limited (one per 20 s per player), every number is clamped to a sane range,
--     and XP can only grow as fast as a person can really study.

create extension if not exists pgcrypto;

create table if not exists public.nhip_rooms (
  code        text primary key check (code ~ '^[A-Z0-9]{4,12}$'),
  max_players int  not null default 15 check (max_players between 1 and 50),
  created_at  timestamptz not null default now()
);

-- Class codes are stored in capitals, so 'English' and 'ENGLISH' are the same class.
create or replace function public.nhip_room_code() returns trigger language plpgsql as $$
begin
  new.code := upper(btrim(new.code));
  return new;
end $$;
drop trigger if exists nhip_room_code on public.nhip_rooms;
create trigger nhip_room_code before insert or update on public.nhip_rooms for each row execute function public.nhip_room_code();

create table if not exists public.nhip_players (
  id           bigint generated always as identity primary key,
  room         text not null references public.nhip_rooms(code) on delete cascade,
  name         text not null,
  pin_hash     text not null,
  token        uuid not null default gen_random_uuid() unique,
  xp           int  not null default 0,
  week_xp      int  not null default 0,
  week         text not null default '',
  words        int  not null default 0,
  streak       int  not null default 0,
  farm_lv      int  not null default 1,
  beasts       int  not null default 0,
  avatar       text not null default '',
  fails        int  not null default 0,
  locked_until timestamptz,
  last_sync    timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists nhip_players_room_name on public.nhip_players (room, lower(name));

alter table public.nhip_rooms   enable row level security;
alter table public.nhip_players enable row level security;
revoke all on public.nhip_rooms, public.nhip_players from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.nhip_rooms, public.nhip_players from anon, authenticated';
  end if;
end $$;

-- Read an integer field from the app's JSON, clamped to [lo, hi]; anything that is not a number becomes lo.
create or replace function public.nhip_int(j jsonb, k text, lo int, hi int) returns int
language sql immutable as $$
  select least(greatest(case when jsonb_typeof(j -> k) = 'number'
                             then floor(least(greatest((j ->> k)::numeric, -2147483648), 2147483647)) else lo end, lo), hi)::int
$$;

-- Join a class, or log back in with the same name + PIN. Returns { ok, token, name } or { ok:false, error }.
create or replace function public.nhip_join(p_room text, p_name text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r      public.nhip_rooms;
  pl     public.nhip_players;
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  n      int;
begin
  select * into r from public.nhip_rooms where code = upper(btrim(coalesce(p_room, '')));
  if not found then return jsonb_build_object('ok', false, 'error', 'no_room'); end if;
  if char_length(v_name) not between 2 and 20 or v_name ~ '[[:cntrl:]<>"''`\\{}]' then
    return jsonb_build_object('ok', false, 'error', 'bad_name');
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4,6}$' then return jsonb_build_object('ok', false, 'error', 'bad_pin'); end if;

  select * into pl from public.nhip_players where room = r.code and lower(name) = lower(v_name) for update;
  if found then
    if pl.locked_until is not null and pl.locked_until > now() then
      return jsonb_build_object('ok', false, 'error', 'locked', 'retry_in', ceil(extract(epoch from pl.locked_until - now())));
    end if;
    if pl.pin_hash = crypt(p_pin, pl.pin_hash) then
      update public.nhip_players set fails = 0, locked_until = null where id = pl.id;
      return jsonb_build_object('ok', true, 'token', pl.token, 'name', pl.name, 'room', r.code, 'new', false);
    end if;
    update public.nhip_players
       set fails = case when pl.fails + 1 >= 5 then 0 else pl.fails + 1 end,
           locked_until = case when pl.fails + 1 >= 5 then now() + interval '15 minutes' else null end
     where id = pl.id;
    return jsonb_build_object('ok', false, 'error', case when pl.fails + 1 >= 5 then 'locked' else 'wrong_pin' end);
  end if;

  perform pg_advisory_xact_lock(hashtext('nhip:' || r.code)); -- serialize the seat count per class
  select count(*) into n from public.nhip_players where room = r.code;
  if n >= r.max_players then return jsonb_build_object('ok', false, 'error', 'room_full', 'max', r.max_players); end if;
  insert into public.nhip_players (room, name, pin_hash) values (r.code, v_name, crypt(p_pin, gen_salt('bf', 8))) returning * into pl;
  return jsonb_build_object('ok', true, 'token', pl.token, 'name', pl.name, 'room', r.code, 'new', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'name_taken');
end $$;

-- Push this player's numbers. p_stats: { xp, week_xp, week, words, streak, farm_lv, beasts, avatar }.
create or replace function public.nhip_sync(p_token uuid, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  pl      public.nhip_players;
  hours   numeric;
  v_xp    int;
  v_week  text;
  v_wxp   int;
  v_av    text;
begin
  if p_token is null or p_stats is null or jsonb_typeof(p_stats) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;
  select * into pl from public.nhip_players where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if pl.last_sync is not null and now() - pl.last_sync < interval '20 seconds' then
    return jsonb_build_object('ok', false, 'error', 'too_fast', 'retry_in', ceil(20 - extract(epoch from now() - pl.last_sync)));
  end if;

  -- XP may grow by at most 600 + 1500 per hour since the last update (a real study pace); it may drop after a reset.
  hours := extract(epoch from now() - coalesce(pl.last_sync, pl.created_at)) / 3600;
  v_xp  := least(public.nhip_int(p_stats, 'xp', 0, 10000000), pl.xp + 600 + floor(hours * 1500)::int);
  v_week := coalesce(p_stats ->> 'week', '');
  if v_week !~ '^[0-9]{4}-W[0-9]{2}$' then v_week := ''; end if;
  v_wxp := least(public.nhip_int(p_stats, 'week_xp', 0, 200000), v_xp);
  v_av  := coalesce(p_stats ->> 'avatar', '');
  if v_av !~ '^[a-z]{0,12}$' then v_av := ''; end if;

  update public.nhip_players set
    xp = v_xp, week = v_week, week_xp = v_wxp, avatar = v_av,
    words   = public.nhip_int(p_stats, 'words', 0, 5000),
    streak  = public.nhip_int(p_stats, 'streak', 0, 3650),
    farm_lv = public.nhip_int(p_stats, 'farm_lv', 1, 10),
    beasts  = public.nhip_int(p_stats, 'beasts', 0, 12),
    last_sync = now()
  where id = pl.id;
  return jsonb_build_object('ok', true, 'xp', v_xp);
end $$;

-- Class leaderboard, visible only to members of that class. Weekly XP counts only for the given ISO week.
create or replace function public.nhip_board(p_token uuid, p_week text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me public.nhip_players;
  r  public.nhip_rooms;
begin
  select * into me from public.nhip_players where token = p_token;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  select * into r from public.nhip_rooms where code = me.room;
  return jsonb_build_object('ok', true, 'room', r.code, 'max', r.max_players, 'players', coalesce((
    select jsonb_agg(jsonb_build_object(
             'name', p.name, 'me', p.id = me.id, 'xp', p.xp,
             'week_xp', case when p.week = coalesce(p_week, '') then p.week_xp else 0 end,
             'words', p.words, 'streak', p.streak, 'farm_lv', p.farm_lv, 'beasts', p.beasts,
             'avatar', p.avatar, 'seen', p.last_sync) order by p.xp desc)
      from public.nhip_players p where p.room = me.room), '[]'::jsonb));
end $$;

-- Leave the class (frees the seat).
create or replace function public.nhip_leave(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.nhip_players where token = p_token;
  return jsonb_build_object('ok', found);
end $$;

revoke all on function public.nhip_int(jsonb, text, int, int) from public;
revoke all on function public.nhip_join(text, text, text) from public;
revoke all on function public.nhip_sync(uuid, jsonb) from public;
revoke all on function public.nhip_board(uuid, text) from public;
revoke all on function public.nhip_leave(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.nhip_join(text, text, text), public.nhip_sync(uuid, jsonb),
             public.nhip_board(uuid, text), public.nhip_leave(uuid) to anon, authenticated';
  end if;
end $$;

-- Create your class (change the code; 4–12 letters or digits, no spaces or accents):
--   insert into public.nhip_rooms (code, max_players) values ('LOP7A', 15);
