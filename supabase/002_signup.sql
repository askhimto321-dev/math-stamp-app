-- 2단계 업데이트: 회원가입(약관 동의 + 추가 정보), 회원 탈퇴, 반 주인 넘기기
-- 이미 schema.sql 을 실행한 프로젝트에서 SQL Editor 에 붙여 넣고 Run 하세요. 여러 번 실행해도 안전합니다.

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
