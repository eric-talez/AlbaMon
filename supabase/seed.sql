-- ============================================================================
-- K-Work US — seed data (LA / Orange County)
-- ============================================================================
-- Reproducible, idempotent-ish seed for local dev and demos. Mirrors the public
-- mock jobs in src/lib/mock/jobs.ts. All company names are clearly fictional —
-- no impersonation of real businesses.
--
-- Compliance: language requirements are framed as job-related only. No
-- Korean-only / nationality / visa-status / under-the-table-cash phrasing.
--
-- Apply AFTER the migration. On Supabase:  supabase db reset  (runs migration +
-- this seed automatically), or paste this file into the SQL editor.
--
-- Owner identities use fixed UUIDs so the seed is deterministic. Inserting into
-- auth.users fires on_auth_user_created, which auto-creates a profiles row; we
-- then promote those profiles to the 'employer' role below.
-- ============================================================================

-- --- Employer auth users (fixed UUIDs) --------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'employer1@example.com',
   crypt('seed-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"employer"}',
   now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'employer2@example.com',
   crypt('seed-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"employer"}',
   now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'employer3@example.com',
   crypt('seed-password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"role":"employer"}',
   now(), now())
on conflict (id) do nothing;

-- Promote the auto-created profiles to employers (trigger inserted them as seeker).
update public.profiles set role = 'employer', display_name = 'Seed Employer 1', city = 'Los Angeles', state = 'CA'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set role = 'employer', display_name = 'Seed Employer 2', city = 'Irvine', state = 'CA'
  where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set role = 'employer', display_name = 'Seed Employer 3', city = 'Gardena', state = 'CA'
  where id = '33333333-3333-3333-3333-333333333333';

-- --- Companies (3, fictional) ----------------------------------------------
insert into public.companies (id, owner_id, name, description, city, state, address_display, is_verified)
values
  ('aaaaaaaa-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'Koreatown Kitchen Collective',
   '코리아타운 한식당 및 카페 그룹 (가상 시드 데이터).',
   'Los Angeles (Koreatown)', 'CA', 'Koreatown, Los Angeles, CA', true),
  ('aaaaaaaa-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   'OC Wellness & Beauty Group',
   '오렌지 카운티 치과/뷰티/헤어 서비스 그룹 (가상 시드 데이터).',
   'Irvine', 'CA', 'Irvine, CA', true),
  ('aaaaaaaa-0000-0000-0000-000000000003',
   '33333333-3333-3333-3333-333333333333',
   'SoCal Trade & Retail Partners',
   '물류/리테일/사무 분야 가상 시드 회사.',
   'Gardena', 'CA', 'Gardena, CA', false)
on conflict (id) do nothing;

-- --- Jobs -------------------------------------------------------------------
-- 8 approved + 1 pending + 1 draft. moderation_status drives public visibility.
insert into public.jobs (
  id, company_id, title, category, job_type, city, state, address_display,
  address_display_mode, pay_min, pay_max, pay_unit, tips_available,
  schedule_days, schedule_time_range, language_requirement, description,
  responsibilities, requirements, benefits, moderation_status, boost, posted_at
)
values
  -- 1. Restaurant server (approved, featured)
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '한식당 홀서버 (파트타임)', 'restaurant_cafe', 'part_time',
   'Los Angeles (Koreatown)', 'CA', 'Koreatown, Los Angeles, CA', 'city_only',
   18, 22, 'hour', true, '주 4–5일 (주말 포함)', '11:00 AM – 4:00 PM',
   'korean_required',
   '코리아타운 인기 한식당에서 홀서버를 모집합니다. 친절하고 성실하신 분을 찾습니다. 팁 별도.',
   '{"주문 접수 및 서빙","테이블 정리","고객 응대"}',
   '{"고객 응대를 위한 한국어 필수","주말 근무 가능자"}',
   '{"식사 제공","팁 별도","유연한 스케줄"}',
   'approved', 'featured', '2026-06-18'),

  -- 2. Dental front desk (approved)
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002',
   '치과 프론트 데스크 리셉셔니스트', 'medical_dental_reception', 'full_time',
   'Irvine', 'CA', 'Irvine, CA 92618', 'city_only',
   22, 27, 'hour', false, '월–금', '9:00 AM – 6:00 PM',
   'bilingual_preferred',
   '환자 응대 및 예약 관리를 담당할 프론트 데스크 직원을 채용합니다. 한/영 이중언어 환자 응대가 가능하신 분 우대합니다.',
   '{"전화 및 방문 환자 응대","예약 스케줄링","보험 확인 보조"}',
   '{"환자 응대를 위한 한/영 의사소통","MS Office 기본 사용"}',
   '{"의료보험","유급휴가","주말 휴무"}',
   'approved', null, '2026-06-17'),

  -- 3. Warehouse logistics (approved, urgent)
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003',
   '무역회사 창고 물류 직원', 'logistics_warehouse', 'full_time',
   'Buena Park', 'CA', 'Buena Park, CA', 'city_only',
   19, 23, 'hour', false, '월–금', '8:00 AM – 5:00 PM',
   'korean_helpful',
   '수출입 물류 창고에서 입출고 및 재고 관리를 담당할 직원을 모집합니다.',
   '{"입출고 처리","재고 관리","포장 및 라벨링"}',
   '{"지게차 경험 우대","한국어 가능자 우대"}',
   '{"초과근무 수당","성과급"}',
   'approved', 'urgent', '2026-06-19'),

  -- 4. Nail artist (approved)
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000002',
   '네일 아티스트 (경력자)', 'beauty_nail_hair', 'part_time',
   'Fullerton', 'CA', 'Fullerton, CA', 'city_only',
   20, 30, 'hour', true, '주 3–5일 협의', '10:00 AM – 7:00 PM',
   'korean_helpful',
   '프리미엄 네일 살롱에서 경력 네일 아티스트를 모십니다. 손님 단골 많은 매장입니다.',
   '{"젤/아크릴 네일","페디큐어","고객 관리"}',
   '{"네일 라이센스 보유","경력 1년 이상"}',
   '{"팁 별도","높은 시급","단골 고객"}',
   'approved', null, '2026-06-15'),

  -- 5. Math tutor (approved)
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000003',
   '수학 강사 (중·고등 / 파트타임)', 'education_tutoring', 'part_time',
   'Garden Grove', 'CA', 'Garden Grove, CA', 'city_only',
   25, 35, 'hour', false, '주 3일 (오후/저녁)', '3:00 PM – 8:00 PM',
   'bilingual_preferred',
   '중·고등 수학을 가르칠 파트타임 강사를 모집합니다. 학생 및 학부모와 한/영 소통이 가능하신 분.',
   '{"수학 수업 진행","숙제 관리","학부모 상담"}',
   '{"관련 전공 또는 강의 경험","한/영 학부모 응대"}',
   '{"유연한 시간","강의 경력 인정"}',
   'approved', null, '2026-06-14'),

  -- 6. Barista (approved)
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001',
   '카페 바리스타 (오전 시프트)', 'restaurant_cafe', 'part_time',
   'Torrance', 'CA', 'Torrance, CA', 'city_only',
   17, 19, 'hour', true, '주 4일', '6:00 AM – 12:00 PM',
   'english_required',
   '아침 시프트 바리스타를 모집합니다. 빠르고 친절한 응대가 가능하신 분을 찾습니다.',
   '{"음료 제조","고객 응대","매장 청결 관리"}',
   '{"고객 응대를 위한 영어 필수","오전 근무 가능자"}',
   '{"팁 별도","음료 제공"}',
   'approved', null, '2026-06-16'),

  -- 7. Market cashier (approved)
  ('bbbbbbbb-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000003',
   '마트 캐셔 / 고객 서비스', 'retail', 'part_time',
   'Gardena', 'CA', 'Gardena, CA', 'city_only',
   17, 20, 'hour', false, '주 5일 (주말 포함)', '12:00 PM – 8:00 PM',
   'korean_helpful',
   '한인 마트에서 캐셔 및 고객 서비스 직원을 모집합니다.',
   '{"계산 및 포장","고객 안내","진열 보조"}',
   '{"성실한 분","한국어 가능 우대"}',
   '{"직원 할인","유연한 스케줄"}',
   'approved', null, '2026-06-13'),

  -- 8. Office admin (approved)
  ('bbbbbbbb-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000003',
   '무역회사 사무 보조 (Office Admin)', 'office_admin', 'full_time',
   'West Covina', 'CA', 'West Covina, CA', 'city_only',
   21, 26, 'hour', false, '월–금', '9:00 AM – 6:00 PM',
   'bilingual_preferred',
   '무역회사에서 일반 사무 및 거래처 응대를 담당할 사무 보조를 채용합니다.',
   '{"서류 작성 및 정리","거래처 이메일/전화 응대","데이터 입력"}',
   '{"엑셀 기본 활용","한/영 거래처 응대"}',
   '{"주말 휴무","장기 근무 우대"}',
   'approved', null, '2026-06-12'),

  -- 9. Bakery sales (PENDING — must not appear publicly)
  ('bbbbbbbb-0000-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000003',
   '베이커리 판매 직원 (검수 대기)', 'retail', 'part_time',
   'Fullerton', 'CA', 'Fullerton, CA', 'city_only',
   17, 19, 'hour', false, '주 4일', '7:00 AM – 1:00 PM',
   'korean_helpful',
   '베이커리 판매 및 매장 관리 직원을 모집합니다.',
   '{"판매 및 포장","진열 관리"}', '{"성실한 분"}', '{"제품 할인"}',
   'pending', null, '2026-06-20'),

  -- 10. Office assistant (DRAFT — never public)
  ('bbbbbbbb-0000-0000-0000-000000000102', 'aaaaaaaa-0000-0000-0000-000000000003',
   '사무 보조 (작성 중 초안)', 'office_admin', 'full_time',
   'Irvine', 'CA', 'Irvine, CA', 'city_only',
   20, 24, 'hour', false, '월–금', '9:00 AM – 6:00 PM',
   'bilingual_preferred',
   '일반 사무 보조 직원을 채용 예정입니다.',
   '{"데이터 입력","서류 정리"}', '{"엑셀 기본"}', '{"주말 휴무"}',
   'draft', null, '2026-06-20')
on conflict (id) do nothing;
