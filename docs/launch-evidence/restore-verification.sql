-- Local restore catalog comparison. Run source and target separately into mode-600 files.
-- Contains definitions/ACL metadata, no raw user rows. Compare exact output before Auth login.
begin read only;
\echo schemaPrivileges
select n.nspname,pg_get_userbyid(n.nspowner),coalesce(g.rolname,'PUBLIC'),r.rolname,x.privilege_type,x.is_grantable from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x left join pg_roles g on g.oid=x.grantee join pg_roles r on r.oid=x.grantor where n.nspname in ('public','auth','storage') order by 1,2,3,4,5,6;
\echo defaultPrivileges
select pg_get_userbyid(d.defaclrole),coalesce(n.nspname,'global'),d.defaclobjtype,coalesce(g.rolname,'PUBLIC'),r.rolname,x.privilege_type,x.is_grantable from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) x left join pg_roles g on g.oid=x.grantee join pg_roles r on r.oid=x.grantor order by 1,2,3,4,5,6,7;
\echo roles
select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolconnlimit,rolvaliduntil,rolbypassrls,rolconfig from pg_roles order by rolname; select r.rolname,m.rolname,a.admin_option from pg_auth_members a join pg_roles r on r.oid=a.roleid join pg_roles m on m.oid=a.member order by 1,2;
\echo extensions
select extname,extversion,nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace order by 1;
\echo history
select version,name,statements from supabase_migrations.schema_migrations order by version;
\echo relations
select c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,(select string_agg(concat(coalesce(g.rolname,'PUBLIC'),':',r.rolname,':',x.privilege_type,':',x.is_grantable),',' order by coalesce(g.rolname,'PUBLIC'),r.rolname,x.privilege_type,x.is_grantable) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) x left join pg_roles g on g.oid=x.grantee join pg_roles r on r.oid=x.grantor),c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S') order by 1;
\echo columns
select c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,(select string_agg(concat(coalesce(g.rolname,'PUBLIC'),':',r.rolname,':',x.privilege_type,':',x.is_grantable),',' order by coalesce(g.rolname,'PUBLIC'),r.rolname,x.privilege_type,x.is_grantable) from aclexplode(a.attacl) x left join pg_roles g on g.oid=x.grantee join pg_roles r on r.oid=x.grantor),pg_get_expr(d.adbin,d.adrelid) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m') order by c.relname,a.attnum;
\echo constraints
select c.relname,x.conname,x.contype,x.convalidated,pg_get_constraintdef(x.oid,true) from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by 1,2;
\echo indexes
select t.relname,c.relname,i.indisvalid,i.indisready,pg_get_indexdef(c.oid) from pg_index i join pg_class c on c.oid=i.indexrelid join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' order by 1,2;
\echo functions
select p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,(select string_agg(concat(coalesce(g.rolname,'PUBLIC'),':',r.rolname,':',x.privilege_type,':',x.is_grantable),',' order by coalesce(g.rolname,'PUBLIC'),r.rolname,x.privilege_type,x.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x left join pg_roles g on g.oid=x.grantee join pg_roles r on r.oid=x.grantor),pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.proname,pg_get_function_identity_arguments(p.oid);
\echo policies
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by 1,2,3;
\echo triggers
select n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public' or (n.nspname in ('auth','storage') and t.tgfoid in(select p.oid from pg_proc p join pg_namespace pn on pn.oid=p.pronamespace where pn.nspname='public'))) order by 1,2,3;
\echo views
select viewname,definition from pg_views where schemaname='public' order by 1;
\echo public_auth_data_hashes
select format('select %L,count(*),md5(coalesce(string_agg(row_to_json(t)::text,E''\n'' order by row_to_json(t)::text),'''')) from %I.%I t;',n.nspname||'.'||c.relname,n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind='r' order by n.nspname,c.relname;
\gexec
\echo foreign_key_orphans
select format('select %L, count(*) from %s child where %s and not exists(select 1 from %s parent where %s);',x.conname,x.conrelid::regclass,string_agg(format('child.%I is not null',a.attname),' and ' order by k.ord),x.confrelid::regclass,string_agg(format('child.%I=parent.%I',a.attname,b.attname),' and ' order by k.ord)) from pg_constraint x cross join lateral unnest(x.conkey,x.confkey) with ordinality k(ca,pa,ord) join pg_attribute a on a.attrelid=x.conrelid and a.attnum=k.ca join pg_attribute b on b.attrelid=x.confrelid and b.attnum=k.pa where x.contype='f' and x.connamespace='public'::regnamespace group by x.oid order by x.conname;
\gexec
select count(*) as invalid_indexes from pg_index where indrelid in(select oid from pg_class where relnamespace='public'::regnamespace) and not indisvalid;
select count(*) as unvalidated_constraints from pg_constraint where connamespace='public'::regnamespace and not convalidated;
select count(*) as public_tables_without_rls from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity;
select (select count(*) from public.public_job_listings)=(select count(*) from public.jobs where public.is_job_open(id)) as public_predicate_matches;
rollback;
