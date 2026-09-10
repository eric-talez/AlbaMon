import { expect, test as base, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
async function setup(context?:BrowserContext) {
  if(url!=="http://127.0.0.1:55321") throw new Error("B3 requires isolated Supabase");
  const status=JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}));
  const service=createClient(url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const users: string[]=[];
  const companyId=randomUUID();
  const jobIds=Array.from({length:21},()=>randomUUID());
  const applicationIds=Array.from({length:21},()=>randomUUID());
  async function user(role:"seeker"|"employer",browser?:BrowserContext) {
    const email=`b3-${randomBytes(8).toString("hex")}@example.invalid`,password=randomBytes(32).toString("base64url");
    const created=await service.auth.admin.createUser({email,password,email_confirm:true});
    if(created.error||!created.data.user) throw new Error("B3 user setup failed");
    const id=created.data.user.id;users.push(id);
    const profile=await service.from("profiles").update({role}).eq("id",id);
    if(profile.error) throw new Error("B3 profile setup failed");
    const cookies=new Map<string,string>();
    const client=createServerClient(url,anonKey,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>{for(const item of items) cookies.set(item.name,item.value);}}});
    if((await client.auth.signInWithPassword({email,password})).error) throw new Error("B3 login failed");
    if(browser) await browser.addCookies([...cookies].map(([name,value])=>({name,value,domain:"127.0.0.1",path:"/"})));
    return {id,client,cookies};
  }
  async function cleanup() {
    const audit=await service.from("audit_logs").delete().in("entity_id",jobIds);
    const jobs=await service.from("jobs").delete().in("id",jobIds);
    const company=await service.from("companies").delete().eq("id",companyId);
    for(const id of users) if((await service.auth.admin.deleteUser(id)).error) throw new Error("B3 user cleanup failed");
    if(audit.error||jobs.error||company.error) throw new Error("B3 fixture cleanup failed");
  }
  try {
    const owner=await user("employer");
    const applicant=await user("seeker",context);
    const company=await service.from("companies").insert({id:companyId,owner_id:owner.id,name:"B3 history fixture",city:"Oakland",state:"CA"});
    const template=await service.from("jobs").select("*").eq("id","bbbbbbbb-0000-0000-0000-000000000001").single();
    if(company.error||template.error) throw new Error("B3 template setup failed");
    const jobs=await service.from("jobs").insert(jobIds.map((id,i)=>({...template.data,id,company_id:companyId,title:`B3 job ${i+1}`,boost:null,moderation_status:"approved",posted_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()})));
    const applications=await service.from("applications").insert(applicationIds.map((id,i)=>({id,job_id:jobIds[i],seeker_id:applicant.id,created_at:new Date(Date.now()-i*1000).toISOString()})));
    if(jobs.error||applications.error) throw new Error("B3 applications setup failed");
    const messages=await service.from("messages").insert(Array.from({length:51},(_,i)=>({application_id:applicationIds[0],sender_id:i%2?owner.id:applicant.id,body:`History message ${String(i+1).padStart(2,"0")}`,created_at:new Date(Date.UTC(2026,0,1,8,0,i)).toISOString()})));
    if(messages.error) throw new Error("B3 messages setup failed");
    return {service,owner,applicant,jobIds,applicationIds,cleanup};
  } catch(error) {await cleanup();throw error;}
}

// Fixture teardown receives its own timeout even when a browser assertion times out.
const test=base.extend<{fixture:Awaited<ReturnType<typeof setup>>}>({
  fixture: [async({context},provide)=>{
    const fixture=await setup(context);
    try {await provide(fixture);} finally {await fixture.cleanup();}
  },{timeout:30000}],
});

test("promoted applicant and owner retain closed history, page through messages, reply, refresh and withdraw",async({page,browser,fixture})=>{
  const ownerContext=await browser.newContext();
  const ownerPage=await ownerContext.newPage();
  try {
    await ownerContext.addCookies([...fixture.owner.cookies].map(([name,value])=>({name,value,domain:"127.0.0.1",path:"/"})));
    expect((await fixture.service.from("profiles").update({role:"employer"}).eq("id",fixture.applicant.id)).error).toBeNull();
    expect((await fixture.service.from("jobs").update({moderation_status:"expired",expires_at:new Date().toISOString()}).in("id",fixture.jobIds)).error).toBeNull();
    await page.goto("/dashboard");
    await page.getByRole("link",{name:"내 지원 현황"}).click();
    await expect(page.getByRole("heading",{name:"내 지원 내역",exact:true})).toBeVisible();
    await expect(page.locator("main > ul > li")).toHaveCount(20);
    await page.getByRole("link",{name:"다음 / Next",exact:true}).click();
    await expect(page.getByRole("heading",{name:"B3 job 21",exact:true})).toBeVisible();
    await expect(page.locator("main > ul > li")).toHaveCount(1);
    await page.goto(`/dashboard/applications/${fixture.applicationIds[0]}/messages`);
    await expect(page.getByText("History message 51",{exact:true})).toBeVisible();
    await expect(page.getByText("History message 01",{exact:true})).toHaveCount(0);
    await expect(page.locator('ol[aria-label="지원 메시지"] > li')).toHaveCount(50);
    await expect(page.getByText(/PT/).first()).toBeVisible();
    await page.getByRole("link",{name:"이전 메시지 / Older messages",exact:true}).click();
    await expect(page.getByText("History message 01",{exact:true})).toBeVisible();
    await page.getByLabel("새 메시지",{exact:true}).fill("Promoted applicant reply");
    await page.getByRole("button",{name:"메시지 보내기",exact:true}).click();
    await expect(page.getByRole("status")).toContainText("메시지를 보냈습니다");
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByLabel("새 메시지",{exact:true})).toHaveValue("");
    await page.getByRole("link",{name:"최근 메시지 / Newer messages",exact:true}).click();
    await expect(page.getByText("Promoted applicant reply",{exact:true})).toBeVisible();
    await ownerPage.goto("/employer/applications");
    await expect(ownerPage.locator("main > ul > li")).toHaveCount(20);
    await expect(ownerPage.locator('option[value="withdrawn"]')).toHaveCount(0);
    const firstApplication = ownerPage.locator("main > ul > li").first();
    const originalRevision = await firstApplication.locator('[name="expectedUpdatedAt"]').inputValue();
    await firstApplication.getByRole("combobox", {name:"지원 상태 변경",exact:true}).selectOption("reviewing");
    await firstApplication.getByRole("button", {name:"상태 변경",exact:true}).click();
    await expect(firstApplication.getByRole("status")).toContainText("검토 중");
    await expect(firstApplication.locator('[name="expectedUpdatedAt"]')).not.toHaveValue(originalRevision);
    await firstApplication.getByRole("combobox", {name:"지원 상태 변경",exact:true}).selectOption("interview");
    await firstApplication.getByRole("button", {name:"상태 변경",exact:true}).click();
    await expect(firstApplication.getByRole("status")).toContainText("면접");
    await ownerPage.getByRole("link",{name:"다음 / Next",exact:true}).click();
    await expect(ownerPage.getByRole("heading",{name:"B3 job 21",exact:true})).toBeVisible();
    await ownerPage.goto(`/employer/applications/${fixture.applicationIds[0]}/messages`);
    await expect(ownerPage.getByText("Promoted applicant reply",{exact:true})).toBeVisible();
    await ownerPage.getByLabel("새 메시지",{exact:true}).fill("Owner reply after closure");
    await ownerPage.getByRole("button",{name:"메시지 보내기",exact:true}).click();
    await expect(ownerPage.getByText("Owner reply after closure",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"새로고침 / Refresh",exact:true}).click();
    await expect(page.getByText("Owner reply after closure",{exact:true})).toBeVisible();
    await page.getByLabel("새 메시지",{exact:true}).fill("Second promoted reply");
    await page.getByRole("button",{name:"메시지 보내기",exact:true}).click();
    await expect(page.getByText("Second promoted reply",{exact:true})).toBeVisible();
    await expect(page.getByLabel("새 메시지",{exact:true})).toHaveValue("");
    await page.goto("/dashboard/applications");
    await page.locator("main > ul > li").first().getByRole("button",{name:"지원 철회 / Withdraw",exact:true}).click();
    await expect(page.locator("main > ul > li").first()).toContainText("철회됨");
    await ownerPage.goto("/employer/applications");
    await expect(ownerPage.locator("main > ul > li").first()).toContainText("Withdrawn by the applicant");
    await ownerPage.goto(`/employer/applications/${fixture.applicationIds[0]}/messages`);
    await expect(ownerPage.getByText("Second promoted reply",{exact:true})).toBeVisible();
  } finally {await page.goto("about:blank").catch(()=>{});await ownerContext.close().catch(()=>{});}
});

test("two valid concurrent employer transitions and a stale applicant withdrawal share raw CAS tokens",async({fixture})=>{
    const id=fixture.applicationIds[0];
    const before=await fixture.owner.client.from("applications").select("updated_at").eq("id",id).single();
    const token=before.data?.updated_at;
    expect(typeof token).toBe("string");
    const results=await Promise.all(["reviewing","interview"].map(status=>fixture.owner.client.from("applications").update({status}).eq("id",id).eq("updated_at",token).select("id")));
    expect(results.map(r=>r.error)).toEqual([null,null]);
    expect(results.map(r=>r.data?.length).sort()).toEqual([0,1]);
    const stale=await fixture.applicant.client.rpc("withdraw_application",{target_application_id:id,expected_updated_at:token});
    expect(stale.data?.[0]?.status).toBe("conflict");
    const current=await fixture.applicant.client.from("applications").select("updated_at").eq("id",id).single();
    expect(current.data?.updated_at).not.toBe(token);
    const withdrawal=await fixture.applicant.client.rpc("withdraw_application",{target_application_id:id,expected_updated_at:current.data?.updated_at});
    expect(withdrawal.data?.[0]?.status).toBe("withdrawn");
    const retry=await fixture.applicant.client.rpc("withdraw_application",{target_application_id:id,expected_updated_at:token});
    expect(retry.data?.[0]?.status).toBe("already_withdrawn");
    expect((await fixture.owner.client.from("applications").update({status:"reviewing"}).eq("id",id)).error?.code).toBe("42501");
});
