-- Advanced: runs the RLS checks against a LOCAL PostgreSQL (not Supabase).
-- Setup: psql -f local-auth-stub.sql, grant table privileges to anon/authenticated, psql -f ../schema.sql, then psql -f rls-test.sql
-- Beginners: use `npm run test:isolation` against your real Supabase project instead.
\set ON_ERROR_STOP 0
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001','a@x.dev'),('bbbbbbbb-0000-0000-0000-000000000002','b@x.dev');
select 'profile trigger: ' || count(*) from public.profiles;

-- ===== as user A: everything the app does
set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into projects (id, user_id, name, original_filename) values ('11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','Demo','d.zip');
insert into scans (id, project_id, user_id, status, stage, original_filename, previous_scan_id) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','QUEUED','validating','d.zip',null);
update scans set status='COMPLETED', stage='completed', started_at=now(), completed_at=now(), files_scanned=3, findings_count=1, high_count=1, medium_count=0, low_count=0, skipped_count=0, truncated=false, error_message=null where id='22222222-2222-2222-2222-222222222222';
insert into findings (id, scan_id, project_id, user_id, rule_id, title, description, file_path, line_number, severity, confidence, evidence, code_snippet, snippet_start_line, recommendation, language, fingerprint)
 values ('33333333-3333-3333-3333-333333333333','22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-000000000001','SQLI-001','t','d','a.java',4,'HIGH','HIGH','e','x',1,'r','Java','fp');
update projects set file_count=3, languages='{Java}', original_filename='d.zip', updated_at=now() where id='11111111-1111-1111-1111-111111111111';
update findings set ai_explanation='{"summary":"s"}', ai_model='m', ai_generated_at=now() where id='33333333-3333-3333-3333-333333333333';
select 'A sees own: projects=' || (select count(*) from projects) || ' scans=' || (select count(*) from scans) || ' findings=' || (select count(*) from findings);
\echo --- A tries to edit evidence: expect permission denied
update findings set severity='LOW' where id='33333333-3333-3333-3333-333333333333';

-- ===== as user B
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
select 'B sees: projects=' || (select count(*) from projects) || ' scans=' || (select count(*) from scans) || ' findings=' || (select count(*) from findings);
update projects set name='hacked' where id='11111111-1111-1111-1111-111111111111';
select 'after B rename attempt, name visible to B rows=' || count(*) from projects;
\echo --- B attaches a scan to project of A: expect RLS violation
insert into scans (project_id, user_id) values ('11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000002');
\echo --- B creates a project owned by A: expect RLS violation
insert into projects (user_id, name) values ('aaaaaaaa-0000-0000-0000-000000000001','spoof');
\echo --- B inserts a finding into scan of A: expect RLS violation
insert into findings (scan_id, project_id, user_id, rule_id, title, description, file_path, line_number, severity, confidence, evidence, code_snippet, recommendation, fingerprint)
 values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','bbbbbbbb-0000-0000-0000-000000000002','X','t','d','a',1,'LOW','LOW','e','x','r','f');
delete from projects where id='11111111-1111-1111-1111-111111111111';

-- ===== anonymous
reset request.jwt.claim.sub; set role anon;
\echo --- anon reads projects: expect permission denied
select count(*) from projects;

reset role;
select 'final (superuser view): name=' || name || ' projects=' || (select count(*) from projects) from projects;
