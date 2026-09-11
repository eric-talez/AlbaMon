import { expect, test as base, type BrowserContext, type Page, type Locator } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { policyAcceptanceIdentity } from "../../src/lib/policy-publication.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret].map(char => alphabet.indexOf(char).toString(2).padStart(5,"0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte,2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest = createHmac("sha1",key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).toString().padStart(6,"0");
}
async function fixture() {
  if(url !== "http://127.0.0.1:55321") throw new Error("C4 requires the owned local stack");
  const status = JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}));
  const service = createClient(url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const userIds:string[] = [], entityIds:string[] = [], jobIds:string[] = [], companyIds:string[] = [];
  async function actor(role:"seeker"|"admin", context:BrowserContext) {
    const email=`c4-${randomBytes(8).toString("hex")}@example.invalid`,password=randomBytes(32).toString("base64url");
    const created = await service.auth.admin.createUser({email,password,email_confirm:true});
    if(created.error || !created.data.user) throw new Error("C4 actor setup failed");
    const id=created.data.user.id;userIds.push(id);
    if(role === "admin") expect((await service.from("profiles").update({role}).eq("id",id)).error).toBeNull();
    const cookies = new Map<string,string>();
    const client = createServerClient(url,anon,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>{for(const item of items) cookies.set(item.name,item.value);}}});
    if((await client.auth.signInWithPassword({email,password})).error) throw new Error("C4 actor login failed");
    const sync = async()=>context.addCookies([...cookies].map(([name,value])=>({name,value,domain:"127.0.0.1",path:"/"})));
    await sync();
    return {id,client,sync};
  }
  async function cleanup() {
    // Discover only this scenario's entities, including a submission interrupted by an assertion failure.
    if(userIds.length) {
      const companies=await service.from("companies").select("id").in("owner_id",userIds);
      companyIds.push(...(companies.data??[]).map(row=>row.id));
      if(companyIds.length) {
        const jobs=await service.from("jobs").select("id").in("company_id",companyIds);
        jobIds.push(...(jobs.data??[]).map(row=>row.id));
      }
      for(const [table,column] of [["applications","seeker_id"],["reports","reporter_id"],["employer_access_requests","requester_id"]]) {
        const rows=await service.from(table).select("id").in(column,userIds);
        if(rows.error) throw new Error("C4 cleanup discovery failed");
        entityIds.push(...(rows.data??[]).map(row=>row.id));
      }
    }
    const ids=[...userIds,...entityIds,...jobIds,...companyIds];
    for(let from=0;from<ids.length;from+=100) {
      const batch=ids.slice(from,from+100);
      expect((await service.from("notification_outbox").delete().in("entity_id",batch)).error).toBeNull();
      expect((await service.from("audit_logs").delete().in("entity_id",batch)).error).toBeNull();
    }
    for(let from=0;from<jobIds.length;from+=100) expect((await service.from("jobs").delete().in("id",jobIds.slice(from,from+100))).error).toBeNull();
    if(companyIds.length) expect((await service.from("companies").delete().in("id",companyIds)).error).toBeNull();
    if(userIds.length) expect((await service.from("employer_access_requests").delete().in("requester_id",userIds)).error).toBeNull();
    for(const id of userIds) expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
    for(let from=0;from<ids.length;from+=100) expect((await service.from("audit_logs").select("id").in("entity_id",ids.slice(from,from+100))).data).toHaveLength(0);
  }
  return {service,actor,cleanup,jobIds,companyIds,entityIds};
}
const test = base.extend<{owned:Awaited<ReturnType<typeof fixture>>}>({
  owned:[async({},provide)=>{ const owned=await fixture();try{await provide(owned);}finally{await owned.cleanup();} },{timeout:30000}],
});
test.use({actionTimeout:10000,navigationTimeout:15000});
async function fits(page:Page) {
  const width=page.viewportSize()!.width;
  expect(await page.evaluate(()=>({body:document.body.scrollWidth,root:document.documentElement.scrollWidth}))).toEqual({body:width,root:width});
}
async function profile(page:Page,name:string,next:string) {
  await page.goto(`/dashboard/profile?next=${encodeURIComponent(next)}`);
  await page.getByLabel("표시 이름 / Display name").fill(name);
  await page.getByLabel("도시 (선택) / City (optional)").fill("Oakland");
  await page.locator('[name="agreeTerms"]').check();
  await page.locator('[name="confirmPrivacyNotice"]').check();
  await fits(page);
  await page.getByRole("button",{name:"저장하고 계속 / Save and continue"}).click();
  await expect(page).toHaveURL(new RegExp(`${next}$`));
}
async function submitPending(page:Page,button:Locator,pending:string) {
  // Hold the actual server action request long enough to inspect pending state deterministically.
  let release!:()=>void;
  const held = new Promise<void>(resolve=>release=resolve);
  await page.route("**/*",async route=> {
    if(route.request().method()==="POST" && route.request().headers()["next-action"]) await held;
    await route.continue();
  });
  try {
    await button.click();
    const pendingButton=page.getByRole("button",{name:pending,exact:true});
    await expect(pendingButton).toBeDisabled();
    // Native rapid second click on disabled control must not create a second request.
    await pendingButton.evaluate(element=>(element as HTMLButtonElement).click());
  } finally {release();await page.unrouteAll({behavior:"wait"});}
}
for(const width of [390,1440]) test(`CA launch role journeys at ${width}px`,async({page,context,browser,owned})=>{
  test.setTimeout(120000);
  await page.setViewportSize({width,height:width===390?844:900});
  const employerContext=await browser.newContext({viewport:page.viewportSize()!});
  const adminContext=await browser.newContext({viewport:page.viewportSize()!});
  const employerPage=await employerContext.newPage(),adminPage=await adminContext.newPage();
  const business=`C4 ${width} ${randomBytes(3).toString("hex")}`;
  const title=(business+" 한국어 고객 응대 담당자를 모집합니다").padEnd(120,"한");
  try {
    await page.goto("/login");
    await expect(page.getByRole("heading",{name:/로그인/}).first()).toBeVisible();
    const seeker=await owned.actor("seeker",context),employer=await owned.actor("seeker",employerContext),admin=await owned.actor("admin",adminContext);
    await profile(page,"C4 seeker","/jobs");
    if(width===390) {
      await page.goto("/dashboard/profile?next=/jobs");
      await context.setOffline(true);
      try {
        await page.getByRole("button",{name:"저장하고 계속 / Save and continue"}).click();
        await expect(page.getByRole("status")).toContainText("저장 중 문제가 발생했습니다");
      } finally {await context.setOffline(false);}
      await page.getByRole("button",{name:"저장하고 계속 / Save and continue"}).click();
      await expect(page).toHaveURL(/\/jobs$/);
    }
    await expect(page.getByRole("heading",{name:"공고 둘러보기",exact:true})).toBeVisible();
    await expect(page.locator('header a[href="/login"]')).toHaveCount(0);
    await page.goto("/dashboard/applications");
    await expect(page.getByText("아직 제출한 지원서가 없습니다.",{exact:true})).toBeVisible();
    await profile(employerPage,"C4 owner","/employer/request-access");
    await employerPage.getByLabel("업체명 / Business name").fill(business);
    await employerPage.getByLabel("담당자 이름 / Contact name").fill("C4 owner");
    await employerPage.getByLabel("도시 / City",{exact:true}).fill("Oakland");
    await submitPending(employerPage,employerPage.getByRole("button",{name:"고용주 권한 요청 제출 / Submit request"}),"접수 중...");
    await expect(employerPage.getByRole("status")).toContainText("접수");
    // Real AAL1 UI gate, then actual local MFA enrollment/verification (no secret capture).
    expect((await admin.client.rpc("acknowledge_policies",{terms:"ca-launch-v1",agree_terms:true,privacy_notice:"ca-launch-v1",confirm_privacy_notice:true,publication_identity:policyAcceptanceIdentity()})).error).toBeNull();
    await adminPage.goto("/admin/employer-requests");
    await expect(adminPage).toHaveURL(/account\/security/);
    const factor=await admin.client.auth.mfa.enroll({factorType:"totp",friendlyName:"C4 local"});
    if(factor.error||!factor.data.totp) throw new Error("C4 MFA enrollment failed");
    const challenge=await admin.client.auth.mfa.challenge({factorId:factor.data.id});
    if(challenge.error) throw new Error("C4 MFA challenge failed");
    if((await admin.client.auth.mfa.verify({factorId:factor.data.id,challengeId:challenge.data.id,code:totp(factor.data.totp.secret)})).error) throw new Error("C4 MFA verification failed");
    await admin.sync();
    await adminPage.goto("/admin/employer-requests");
    await fits(adminPage);
    await adminPage.locator("main > ul > li").filter({hasText:business}).getByRole("button",{name:"승인 (고용주 전환)"}).click();
    await expect.poll(async()=>(await employer.client.from("profiles").select("role").eq("id",employer.id).single()).data?.role).toBe("employer");
    await employerPage.goto("/employer/company");
    await employerPage.getByLabel("회사명",{exact:true}).fill(business);
    await employerPage.getByLabel("회사 소개",{exact:true}).fill("C4 local browser company description");
    await employerPage.getByLabel("도시",{exact:true}).fill("Oakland");
    await employerPage.getByLabel("표시 주소",{exact:true}).fill("Oakland, CA");
    await submitPending(employerPage,employerPage.getByRole("button",{name:"회사 등록",exact:true}),"저장 중…");
    await expect(employerPage.getByRole("status")).toBeVisible();
    const company=await employer.client.from("companies").select("id").eq("owner_id",employer.id).single();
    expect(company.error).toBeNull();owned.companyIds.push(company.data!.id);
    await employerPage.goto("/employer/jobs/new");
    for(const [name,value] of Object.entries({title,city:"Oakland",payMin:"20",payMax:"25",scheduleDays:"월–금",scheduleTimeRange:"09:00–17:00",description:"한국어 고객 응대 업무입니다.\n실제 지원과 대화를 확인하는 로컬 테스트입니다."})) await employerPage.locator(`form [name="${name}"]`).fill(value);
    await employerPage.locator('[name="category"]').selectOption("other");
    await employerPage.locator('[name="jobType"]').selectOption("part_time");
    await employerPage.locator('[name="languageRequirement"]').selectOption("korean_helpful");
    await employerPage.locator('[name="complianceAcknowledgement"]').check();
    await fits(employerPage);
    await submitPending(employerPage,employerPage.getByRole("button",{name:"검토 요청으로 제출",exact:true}),"제출 중…");
    await expect(employerPage.getByRole("status")).toBeVisible();
    const jobs=await employer.client.from("jobs").select("id,moderation_status").eq("company_id",company.data!.id);
    expect(jobs.data).toHaveLength(1);const jobId=jobs.data![0].id;owned.jobIds.push(jobId);
    await adminPage.goto(`/admin/jobs?job=${jobId}`);
    await fits(adminPage);
    await adminPage.getByRole("button",{name:"승인",exact:true}).click();
    await expect.poll(async()=>(await employer.client.from("jobs").select("moderation_status").eq("id",jobId).single()).data?.moderation_status).toBe("approved");
    await employerPage.goto("/employer/jobs");
    await expect(employerPage.getByText("게시됨",{exact:true})).toBeVisible();
    await employerPage.getByRole("link",{name:"공개 공고 보기",exact:true}).click();
    await expect(employerPage.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await page.goto(`/jobs?q=${encodeURIComponent(business)}`);
    await page.getByRole("link",{name:new RegExp(business)}).first().click();
    await fits(page);
    const structured=JSON.parse(await page.locator('script[type="application/ld+json"]').textContent()??"{}");
    expect(structured.title).toBe(title);expect(structured.description).toContain("<p>");
    const apply=page.getByRole("link",{name:"지원하기 (Apply)",exact:true});
    await apply.scrollIntoViewIfNeeded();
    if(width===390) {
      const control=await apply.boundingBox(),nav=await page.getByRole("navigation",{name:"모바일 메뉴"}).boundingBox();
      expect(control!.y+control!.height).toBeLessThanOrEqual(nav!.y);
    }
    await apply.click();
    await page.getByLabel("지원 메모",{exact:false}).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button",{name:"지원하기 (Apply)",exact:true})).toBeFocused();
    expect(await page.getByRole("button",{name:"지원하기 (Apply)",exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe("none");
    await page.getByLabel("지원 메모",{exact:false}).fill("C4 실제 지원 메모");
    await submitPending(page,page.getByRole("button",{name:"지원하기 (Apply)",exact:true}),"지원 처리 중…");
    await expect(page.getByRole("status")).toContainText("지원");
    await page.getByRole("link",{name:"내 지원 현황",exact:true}).click();
    const applications=await seeker.client.from("applications").select("id").eq("job_id",jobId);
    expect(applications.data).toHaveLength(1);const appId=applications.data![0].id;owned.entityIds.push(appId);
    await page.goto(`/jobs/${jobId}/apply`);
    await page.getByRole("button",{name:"지원하기 (Apply)",exact:true}).click();
    await expect(page.getByText(/이미 지원/).first()).toBeVisible();
    await page.goto(`/dashboard/applications/${appId}/messages`);
    await expect(page.getByText(/아직 메시지/).first()).toBeVisible();
    await page.getByLabel("새 메시지",{exact:true}).fill("C4 문의드립니다");
    await submitPending(page,page.getByRole("button",{name:"메시지 보내기",exact:true}),"전송 중…");
    await expect(page.getByText("C4 문의드립니다",{exact:true})).toBeVisible();
    await employerPage.goto(`/employer/applications/${appId}/messages`);
    await employerPage.getByLabel("새 메시지",{exact:true}).fill("C4 실제 고용주 답장");
    await employerPage.getByRole("button",{name:"메시지 보내기",exact:true}).click();
    await expect(employerPage.getByText("C4 실제 고용주 답장",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"새로고침 / Refresh",exact:true}).click();
    await expect(page.getByText("C4 실제 고용주 답장",{exact:true})).toBeVisible();
    await fits(page);
    const report=await seeker.client.from("reports").insert({job_id:jobId,reporter_id:seeker.id,reason:"misleading_or_suspicious",details:"C4 local review"}).select("id").single();
    expect(report.error).toBeNull();owned.entityIds.push(report.data!.id);
    await adminPage.goto("/admin/reports");
    const reportCard=adminPage.locator("main > ul > li").filter({hasText:title});
    await reportCard.getByLabel("공고 중지 사유 / Pause reason").fill("C4 local documented review");
    await reportCard.getByRole("button",{name:"공고 중지 후 검토 완료 / Pause and review"}).click();
    await expect.poll(async()=>(await admin.client.from("reports").select("status").eq("id",report.data!.id).single()).data?.status).toBe("reviewed");
    const audit=await admin.client.from("audit_logs").select("action,metadata").eq("entity_id",jobId).eq("action","job.paused");
    expect(audit.data).toHaveLength(1);expect(audit.data![0].metadata.reason).toBe("C4 local documented review");
    await employerPage.goto("/employer/jobs");
    await expect(employerPage.getByText("C4 local documented review",{exact:false})).toBeVisible();
    await employerPage.getByRole("button",{name:"마감 / Close",exact:true}).click();
    await expect(employerPage.getByText("마감",{exact:true})).toBeVisible();
    await page.goto("/dashboard/applications");
    await page.getByRole("button",{name:"지원 철회 / Withdraw",exact:true}).click();
    await expect(page.getByText("철회됨 (Withdrawn)",{exact:true})).toBeVisible();
    expect((await seeker.client.from("applications").select("status").eq("id",appId).single()).data?.status).toBe("withdrawn");
    await page.goto(`/jobs/${jobId}`);
    await expect(page.getByRole("heading",{name:"페이지를 찾을 수 없습니다.",exact:true})).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    await adminPage.goto("/admin/analytics");
    await expect(adminPage.getByRole("region",{name:"CA 게시 성과"})).toContainText("28일 전부터 7일 전까지");
    await fits(adminPage);
    await page.goto("/terms");await fits(page);
  } finally { await page.goto("about:blank").catch(()=>{});await employerContext.close().catch(()=>{});await adminContext.close().catch(()=>{}); }
});


test("anonymous dynamic sitemap crosses the real 1001-row boundary and removes expired jobs",async({request,context,owned})=>{
  test.setTimeout(60000);
  const actor=await owned.actor("seeker",context);
  expect((await owned.service.from("profiles").update({role:"employer"}).eq("id",actor.id)).error).toBeNull();
  const companyId=randomUUID();owned.companyIds.push(companyId);
  expect((await owned.service.from("companies").insert({id:companyId,owner_id:actor.id,name:"C4 sitemap fixture",city:"Oakland",state:"CA"})).error).toBeNull();
  const template=await owned.service.from("jobs").select("*").eq("id","bbbbbbbb-0000-0000-0000-000000000001").single();
  expect(template.error).toBeNull();
  const ids=Array.from({length:1001},()=>randomUUID());owned.jobIds.push(...ids);
  expect((await owned.service.from("jobs").insert(ids.map(id=>({...template.data,id,company_id:companyId,title:"C4 sitemap row",boost:null,posted_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString(),moderation_status:"approved"})))).error).toBeNull();
  const response=await request.get("/sitemap.xml");expect(response.status()).toBe(200);
  const xml=await response.text();
  for(const id of ids) expect(xml).toContain(`/jobs/${id}</loc>`);
  expect(new Set([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1])).size).toBe([...xml.matchAll(/<loc>/g)].length);
  const withCookie=await request.get("/sitemap.xml",{headers:{cookie:"kw_dev_session=admin"}});
  expect(await withCookie.text()).toBe(xml);
  // Owned setup expiry simulates time passing without waiting a day.
  expect((await owned.service.from("jobs").update({expires_at:new Date(Date.now()-1000).toISOString()}).eq("id",ids[0])).error).toBeNull();
  const refreshed=await request.get("/sitemap.xml");
  expect(await refreshed.text()).not.toContain(`/jobs/${ids[0]}</loc>`);
  expect(await refreshed.text()).toContain(`/jobs/${ids[1000]}</loc>`);
});
