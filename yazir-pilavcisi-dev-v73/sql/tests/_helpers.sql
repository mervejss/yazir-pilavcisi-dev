-- Test yardımcıları: her test dosyası başında \i tests/_helpers.sql yapar. Test sonunda ROLLBACK → veritabanı temiz kalır.
create or replace function pg_temp.login_as_owner() returns uuid language plpgsql as $$
declare u uuid;
begin
  select id into u from public.profiles where role = 'owner' and is_active limit 1;
  if u is null then
    u := gen_random_uuid();
    insert into auth.users (id, email) values (u, 'test-owner@example.com');
    insert into public.profiles (id, full_name, email, role) values (u, 'Test Sahip', 'test-owner@example.com', 'owner')
      on conflict (id) do update set role = 'owner', is_active = true;
  end if;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return u;
end $$;
create or replace function pg_temp.login_as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
end $$;
