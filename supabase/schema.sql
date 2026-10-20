-- 수학 도장노트 · Supabase 데이터베이스 설정
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run 을 누르세요.
-- 여러 번 실행해도 안전하도록 작성했습니다.

create extension if not exists pgcrypto;

-- ───────────────────────── 테이블 ─────────────────────────

-- 선생님 프로필 (로그인하면 자동으로 만들어짐)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '선생님',
  created_at timestamptz not null default now()
);

-- 반 (id = 6자리 반 코드)
create table if not exists public.classes (
  id text primary key,
  name text not null check (char_length(name) between 1 and 60),
  subject text not null check (subject in ('cm2','calc1','geo')),
  term text not null default '',
  hours int not null default 64 check (hours between 1 and 400),
  threshold int not null default 40 check (threshold between 0 and 100),
  scoring jsonb not null default '{}'::jsonb,
  owner_id uuid not null references auth.users(id) on delete cascade,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- 반 구성원: owner(만든 사람) · editor(담당 교사, 모두 수정) · stamper(협력 교사, 수업·도장만)
create table if not exists public.class_members (
  class_id text not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'stamper' check (role in ('owner','editor','stamper')),
  status text not null default 'pending' check (status in ('pending','active')),
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes(id) on delete cascade,
  no int not null,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists students_class on public.students(class_id);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes(id) on delete cascade,
  date date not null,
  period int,
  unit text not null default '',
  topic text not null default '',
  pages text not null default '',
  memo text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists sessions_class on public.sessions(class_id);

-- 도장·결석: 한 수업 × 한 학생 = 한 줄. state 'none' 은 지운 상태
create table if not exists public.marks (
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  state text not null check (state in ('stamp','absent','none')),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index if not exists marks_class on public.marks(class_id);

-- 추가 항목 점수 (항목 정의는 classes.scoring 안에 있음)
create table if not exists public.item_scores (
  class_id text not null references public.classes(id) on delete cascade,
  item_id text not null,
  student_id uuid not null references public.students(id) on delete cascade,
  value numeric,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (class_id, item_id, student_id)
);

-- 최소 성취수준 보장지도: 학생별 상태
create table if not exists public.csb (
  student_id uuid primary key references public.students(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  rate numeric check (rate is null or rate between 0 and 100),
  done boolean not null default false,
  memo text not null default '',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create index if not exists csb_class on public.csb(class_id);

-- 최성보 지도 기록
create table if not exists public.csb_logs (
  id uuid primary key default gen_random_uuid(),
  class_id text not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('예방지도','보충지도')),
  hours numeric not null default 1,
  content text not null,
  result text not null default '진행 중',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists csb_logs_class on public.csb_logs(class_id);

-- 수정 기록 (누가 언제 무엇을 바꿨는지)
create table if not exists public.audit_log (
  id bigserial primary key,
  class_id text not null references public.classes(id) on delete cascade,
  user_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_class_at on public.audit_log(class_id, at desc);

-- ───────────────────────── 권한 확인 함수 ─────────────────────────

create or replace function public.my_role(cid text) returns text
language sql stable security definer set search_path = public as $$
  select role from public.class_members
  where class_id = cid and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.can_read(cid text) returns boolean
language sql stable as $$ select public.my_role(cid) is not null $$;

create or replace function public.can_stamp(cid text) returns boolean
language sql stable as $$ select public.my_role(cid) in ('owner','editor','stamper') $$;

create or replace function public.can_edit(cid text) returns boolean
language sql stable as $$ select public.my_role(cid) in ('owner','editor') $$;

create or replace function public.is_owner(cid text) returns boolean
language sql stable as $$ select public.my_role(cid) = 'owner' $$;

create or replace function public.shares_class(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_members a
    join public.class_members b on a.class_id = b.class_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ───────────────────────── 자동 처리 (트리거) ─────────────────────────

-- 로그인한 사람의 프로필 만들기 (구글·카카오 이름 사용)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(
    nullif(new.raw_user_meta_data->>'full_name',''),
    nullif(new.raw_user_meta_data->>'name',''),
    nullif(new.raw_user_meta_data->>'nickname',''),
    nullif(new.raw_user_meta_data->>'preferred_username',''),
    split_part(coalesce(new.email,''),'@',1),
    '선생님'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 도장 줄의 class_id 는 항상 수업의 반과 같게
create or replace function public.marks_fill_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select class_id into new.class_id from public.sessions where id = new.session_id;
  if not exists (select 1 from public.students where id = new.student_id and class_id = new.class_id) then
    raise exception '다른 반 학생입니다';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists marks_fill on public.marks;
create trigger marks_fill before insert or update on public.marks
  for each row execute function public.marks_fill_class();

-- 점수·최성보 줄의 학생이 같은 반인지 확인
create or replace function public.check_student_class() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.students where id = new.student_id and class_id = new.class_id) then
    raise exception '다른 반 학생입니다';
  end if;
  if tg_table_name in ('item_scores','csb') then
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists item_scores_check on public.item_scores;
create trigger item_scores_check before insert or update on public.item_scores
  for each row execute function public.check_student_class();
drop trigger if exists csb_check on public.csb;
create trigger csb_check before insert or update on public.csb
  for each row execute function public.check_student_class();
drop trigger if exists csb_logs_check on public.csb_logs;
create trigger csb_logs_check before insert or update on public.csb_logs
  for each row execute function public.check_student_class();

-- 수정 기록 남기기
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; d jsonb;
begin
  if tg_op = 'DELETE' then j := to_jsonb(old); else j := to_jsonb(new); end if;
  d := case tg_table_name
    when 'marks' then jsonb_build_object('session_id', j->'session_id', 'student_id', j->'student_id', 'state', j->'state')
    when 'item_scores' then jsonb_build_object('item_id', j->'item_id', 'student_id', j->'student_id', 'value', j->'value')
    when 'csb' then jsonb_build_object('student_id', j->'student_id', 'rate', j->'rate', 'done', j->'done')
    when 'csb_logs' then jsonb_build_object('student_id', j->'student_id', 'kind', j->'kind', 'date', j->'date')
    when 'students' then jsonb_build_object('student_id', j->'id', 'no', j->'no', 'name', j->'name')
    when 'sessions' then jsonb_build_object('session_id', j->'id', 'date', j->'date', 'topic', j->'topic')
    else '{}'::jsonb end;
  insert into public.audit_log (class_id, user_id, action, detail)
  values (j->>'class_id', auth.uid(), tg_table_name || ':' || lower(tg_op), d);
  return null;
exception when foreign_key_violation then
  return null; -- 반 전체를 지울 때는 기록하지 않음
end $$;
do $$ declare t text; begin
  foreach t in array array['marks','item_scores','csb','csb_logs','students','sessions'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- ───────────────────────── 기능 함수 (RPC) ─────────────────────────

-- 반 만들기: 코드 생성 + 만든 사람을 owner 로 등록
create or replace function public.create_class(p_name text, p_subject text, p_term text, p_hours int, p_scoring jsonb default '{}'::jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare code text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  loop
    code := '';
    for i in 1..6 loop code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.classes where id = code);
  end loop;
  insert into public.classes (id, name, subject, term, hours, scoring, owner_id)
  values (code, p_name, p_subject, coalesce(p_term,''), coalesce(p_hours,64), coalesce(p_scoring,'{}'::jsonb), auth.uid());
  insert into public.class_members (class_id, user_id, role, status) values (code, auth.uid(), 'owner', 'active');
  return code;
end $$;

-- 반 코드로 참여 요청 (만든 선생님이 승인해야 기록을 볼 수 있음)
create or replace function public.request_join(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare c record; m record;
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  select id, name into c from public.classes where id = upper(trim(p_code));
  if c.id is null then return json_build_object('ok', false); end if;
  select * into m from public.class_members where class_id = c.id and user_id = auth.uid();
  if m.class_id is null then
    insert into public.class_members (class_id, user_id, role, status) values (c.id, auth.uid(), 'stamper', 'pending');
    return json_build_object('ok', true, 'id', c.id, 'name', c.name, 'status', 'pending');
  end if;
  return json_build_object('ok', true, 'id', c.id, 'name', c.name, 'status', m.status);
end $$;

-- 대기 중인 반 이름 보기 (승인 전에도 내 요청 목록에 이름이 보이도록)
create or replace function public.my_classes()
returns table (id text, name text, subject text, term text, archived boolean, role text, status text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.subject, c.term, c.archived, m.role, m.status
  from public.class_members m join public.classes c on c.id = m.class_id
  where m.user_id = auth.uid()
  order by c.archived, c.created_at desc
$$;

-- ───────────────────────── 접근 규칙 (RLS) ─────────────────────────

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.students enable row level security;
alter table public.sessions enable row level security;
alter table public.marks enable row level security;
alter table public.item_scores enable row level security;
alter table public.csb enable row level security;
alter table public.csb_logs enable row level security;
alter table public.audit_log enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy profiles_read on public.profiles for select using (id = auth.uid() or public.shares_class(id));
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy classes_read on public.classes for select using (public.can_read(id));
create policy classes_update on public.classes for update using (public.can_edit(id)) with check (public.can_edit(id));
create policy classes_delete on public.classes for delete using (public.is_owner(id));

create policy members_read on public.class_members for select using (user_id = auth.uid() or public.can_read(class_id));
create policy members_update on public.class_members for update
  using (public.is_owner(class_id) and user_id <> auth.uid())
  with check (public.is_owner(class_id) and role <> 'owner');
create policy members_delete on public.class_members for delete
  using ((public.is_owner(class_id) and user_id <> auth.uid()) or (user_id = auth.uid() and role <> 'owner'));

create policy students_read on public.students for select using (public.can_read(class_id));
create policy students_write on public.students for insert with check (public.can_edit(class_id));
create policy students_update on public.students for update using (public.can_edit(class_id)) with check (public.can_edit(class_id));
create policy students_delete on public.students for delete using (public.can_edit(class_id));

create policy sessions_read on public.sessions for select using (public.can_read(class_id));
create policy sessions_insert on public.sessions for insert with check (public.can_stamp(class_id));
create policy sessions_update on public.sessions for update using (public.can_stamp(class_id)) with check (public.can_stamp(class_id));
create policy sessions_delete on public.sessions for delete using (public.can_edit(class_id));

create policy marks_read on public.marks for select using (public.can_read(class_id));
create policy marks_insert on public.marks for insert with check (public.can_stamp(class_id));
create policy marks_update on public.marks for update using (public.can_stamp(class_id)) with check (public.can_stamp(class_id));

create policy scores_read on public.item_scores for select using (public.can_read(class_id));
create policy scores_insert on public.item_scores for insert with check (public.can_edit(class_id));
create policy scores_update on public.item_scores for update using (public.can_edit(class_id)) with check (public.can_edit(class_id));
create policy scores_delete on public.item_scores for delete using (public.can_edit(class_id));

create policy csb_read on public.csb for select using (public.can_read(class_id));
create policy csb_insert on public.csb for insert with check (public.can_edit(class_id));
create policy csb_update on public.csb for update using (public.can_edit(class_id)) with check (public.can_edit(class_id));

create policy logs_read on public.csb_logs for select using (public.can_read(class_id));
create policy logs_insert on public.csb_logs for insert with check (public.can_edit(class_id));
create policy logs_delete on public.csb_logs for delete using (public.can_edit(class_id));

create policy audit_read on public.audit_log for select using (public.can_read(class_id));

-- 권한 (Supabase 기본값과 같지만, 빠진 경우를 대비해 한 번 더)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant execute on function public.create_class(text,text,text,int,jsonb), public.request_join(text), public.my_classes() to authenticated;
revoke execute on function public.create_class(text,text,text,int,jsonb), public.request_join(text), public.my_classes() from anon, public;

-- ───────────────────────── 실시간 동기화 ─────────────────────────
do $$ declare t text; begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['classes','class_members','students','sessions','marks','item_scores','csb','csb_logs'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ───────────── 회원가입 · 탈퇴 · 주인 넘기기 (002_signup.sql 과 같음) ─────────────
-- 선생님 프로필에 가입 정보 추가
alter table public.profiles add column if not exists school text not null default '';
alter table public.profiles add column if not exists subjects text[] not null default '{}';
alter table public.profiles add column if not exists terms_agreed_at timestamptz;
alter table public.profiles add column if not exists privacy_agreed_at timestamptz;
alter table public.profiles add column if not exists marketing_agreed boolean not null default false;
alter table public.profiles add column if not exists signup_completed_at timestamptz;

-- 가입 완료 (필수 동의가 없으면 거부)
create or replace function public.complete_signup(p_name text, p_school text, p_subjects text[], p_terms boolean, p_privacy boolean, p_marketing boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if not coalesce(p_terms, false) or not coalesce(p_privacy, false) then raise exception '필수 약관에 동의해 주세요'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 30 then raise exception '이름을 1~30자로 입력해 주세요'; end if;
  insert into public.profiles (id, name) values (auth.uid(), trim(p_name)) on conflict (id) do nothing;
  update public.profiles set
    name = trim(p_name),
    school = left(trim(coalesce(p_school, '')), 60),
    subjects = coalesce(p_subjects, '{}'),
    terms_agreed_at = now(),
    privacy_agreed_at = now(),
    marketing_agreed = coalesce(p_marketing, false),
    signup_completed_at = coalesce(signup_completed_at, now())
  where id = auth.uid();
end $$;

-- 반 주인 넘기기 (주인만, 활동 중인 구성원에게)
create or replace function public.transfer_owner(p_class text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(p_class) is distinct from 'owner' then raise exception '반을 만든 선생님만 넘길 수 있습니다'; end if;
  if not exists (select 1 from public.class_members where class_id = p_class and user_id = p_user and status = 'active') then
    raise exception '승인된 선생님에게만 넘길 수 있습니다';
  end if;
  update public.class_members set role = 'editor' where class_id = p_class and user_id = auth.uid();
  update public.class_members set role = 'owner' where class_id = p_class and user_id = p_user;
  update public.classes set owner_id = p_user where id = p_class;
end $$;

-- 회원 탈퇴: 다른 선생님과 함께 쓰는 반의 주인이면 먼저 넘기거나 삭제해야 함
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다'; end if;
  if exists (
    select 1 from public.classes c
    where c.owner_id = auth.uid()
      and exists (select 1 from public.class_members m where m.class_id = c.id and m.user_id <> auth.uid() and m.status = 'active')
  ) then
    raise exception '다른 선생님과 함께 쓰는 반의 주인입니다. 반·설정에서 주인을 넘기거나 반을 삭제한 뒤 탈퇴해 주세요.';
  end if;
  delete from public.classes where owner_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

grant execute on function public.complete_signup(text,text,text[],boolean,boolean,boolean), public.transfer_owner(text,uuid), public.delete_my_account() to authenticated;
revoke execute on function public.complete_signup(text,text,text[],boolean,boolean,boolean), public.transfer_owner(text,uuid), public.delete_my_account() from anon, public;
