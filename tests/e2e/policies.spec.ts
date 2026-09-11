import { test, expect } from "@playwright/test";
for (const path of ["/terms", "/privacy", "/posting-policy", "/work-authorization-info"]) {
  test(`reviewable policy ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).not.toContainText(/Coming soon|준비 중/);
    await expect(page.locator("main")).toContainText("Draft for review");
    expect(await page.locator("main section").count()).toBeGreaterThanOrEqual(4);
  });
}

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
test("explicit profile and posting acknowledgement survive REST bypass attempts and real forms", async ({page,context}) => {
  const config=JSON.parse(execFileSync("supabase",["status","-o","json"],{stdio:["ignore","pipe","ignore"],encoding:"utf8"}));
  if(config.API_URL!=="http://127.0.0.1:55321") throw new Error("Owned local stack required");
  const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const email=`policy-${randomUUID()}@example.invalid`,password=randomBytes(32).toString("base64url"),companyId=randomUUID();
  const created=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{terms_version:"ca-launch-v1"}});
  if(created.error || !created.data.user) throw new Error("Policy fixture creation failed");
  const id=created.data.user.id,jobIds:string[]=[];
  try {
    expect((await service.from("profiles").select("terms_version,terms_accepted_at,privacy_notice_version,privacy_notice_acknowledged_at").eq("id",id).single()).data).toEqual({terms_version:null,terms_accepted_at:null,privacy_notice_version:null,privacy_notice_acknowledged_at:null});
    const cookies=new Map<string,string>();
    const self=createServerClient(config.API_URL,config.ANON_KEY,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>{for(const item of items) cookies.set(item.name,item.value);}}});
    if((await self.auth.signInWithPassword({email,password})).error) throw new Error("Policy fixture sign-in failed");
    await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:"127.0.0.1",path:"/"})));
    expect((await self.from("profiles").update({display_name:"Unchecked"}).eq("id",id)).error?.message).toBe("policy_acknowledgement_required");
    expect((await self.from("profiles").update({terms_version:"ca-launch-v1",terms_accepted_at:"1900-01-01",privacy_notice_version:"ca-launch-v1"}).eq("id",id)).error?.code).toBe("42501");
    for(const args of [{terms:"old",agree_terms:true,privacy_notice:"ca-launch-v1",confirm_privacy_notice:true},{terms:"ca-launch-v1",agree_terms:false,privacy_notice:"ca-launch-v1",confirm_privacy_notice:true},{terms:"ca-launch-v1",agree_terms:true,privacy_notice:"ca-launch-v1",confirm_privacy_notice:false}]) expect((await self.rpc("acknowledge_policies",args)).error?.code).toBe("42501");
    // Reads remain available before agreement.
    await page.goto("/dashboard/applications");expect((await page.locator("main").textContent())?.includes("지원")).toBe(true);
    await page.goto("/dashboard/profile?next=%2Femployer");
    await page.getByLabel("표시 이름 / Display name").fill("Policy user");
    await page.getByRole("button",{name:"저장하고 계속 / Save and continue"}).click();
    expect((await service.from("profiles").select("terms_version").eq("id",id).single()).data?.terms_version).toBeNull();
    await page.locator('[name="agreeTerms"]').check();
    await page.getByRole("button",{name:"저장하고 계속 / Save and continue"}).click();
    expect((await service.from("profiles").select("terms_version").eq("id",id).single()).data?.terms_version).toBeNull();
    await page.locator('[name="confirmPrivacyNotice"]').check();
    const before=Date.now();
    await page.getByRole("button",{name:"저장하고 계속 / Save and continue"}).click();
    await expect(page).not.toHaveURL(/dashboard\/profile/);
    const accepted=await service.from("profiles").select("terms_version,terms_accepted_at,privacy_notice_version,privacy_notice_acknowledged_at").eq("id",id).single();
    expect(accepted.data?.terms_version).toBe("ca-launch-v1");expect(accepted.data?.privacy_notice_version).toBe("ca-launch-v1");
    expect(Date.parse(accepted.data!.terms_accepted_at)>=before-1000).toBe(true);
    expect(accepted.data?.terms_accepted_at).toBe(accepted.data?.privacy_notice_acknowledged_at);
    expect((await self.from("profiles").update({city:"Oakland"}).eq("id",id)).error).toBeNull();
    expect((await self.from("profiles").update({terms_accepted_at:"2100-01-01"}).eq("id",id)).error?.code).toBe("42501");
    expect((await self.rpc("acknowledge_policies",{terms:"ca-launch-v1",agree_terms:true,privacy_notice:"ca-launch-v1",confirm_privacy_notice:true})).error).toBeNull();
    expect((await service.from("profiles").select("terms_accepted_at").eq("id",id).single()).data?.terms_accepted_at).toBe(accepted.data?.terms_accepted_at);
    expect((await service.from("profiles").update({role:"employer"}).eq("id",id)).error).toBeNull();
    expect((await service.from("companies").insert({id:companyId,owner_id:id,name:"Policy toy company",city:"Oakland"})).error).toBeNull();
    const template={company_id:companyId,title:"Policy toy job",category:"other",job_type:"part_time",city:"Oakland",state:"CA",pay_min:20,pay_max:25,pay_unit:"hour",schedule_days:"Mon",schedule_time_range:"9-5",language_requirement:"english_required",description:"Local toy work",moderation_status:"pending",boost:null};
    for(const extra of [{},{posting_policy_version:"old"},{posting_policy_version:"ca-launch-v1",posting_policy_acknowledged_at:"1900-01-01"}]) expect((await self.from("jobs").insert({...template,...extra})).error?.code).toBe("42501");
    await page.goto("/employer/jobs/new");
    for(const [name,value] of Object.entries({title:"Policy toy job",city:"Oakland",payMin:"20",payMax:"25",scheduleDays:"Mon",scheduleTimeRange:"9-5",description:"Local toy work"})) await page.locator(`form [name="${name}"]`).fill(value);
    for(const [name,value] of Object.entries({category:"other",jobType:"part_time",languageRequirement:"english_required"})) await page.locator(`form [name="${name}"]`).selectOption(value);
    await page.getByRole("button",{name:"검토 요청으로 제출",exact:true}).click();
    expect((await service.from("jobs").select("id").eq("company_id",companyId)).data).toHaveLength(0);
    await page.locator('[name="complianceAcknowledgement"]').check();
    await page.getByRole("button",{name:"검토 요청으로 제출",exact:true}).click();
    await expect(page.getByRole("status")).toContainText("검토");
    const jobs=await service.from("jobs").select("id,posting_policy_version,posting_policy_acknowledged_at,moderation_status").eq("company_id",companyId);
    jobIds.push(...(jobs.data??[]).map(row=>row.id));expect(jobs.data).toHaveLength(1);
    expect(jobs.data?.[0]).toMatchObject({posting_policy_version:"ca-launch-v1",moderation_status:"pending"});
    expect(Date.parse(jobs.data![0].posting_policy_acknowledged_at)>=before-1000).toBe(true);
    expect((await self.from("jobs").update({posting_policy_acknowledged_at:"2100-01-01"}).eq("id",jobIds[0])).error?.code).toBe("42501");
  } finally {
    await page.goto("about:blank").catch(()=>{});
    const allJobs=await service.from("jobs").select("id").eq("company_id",companyId);
    const ownedIds=[id,companyId,...jobIds,...(allJobs.data??[]).map(row=>row.id)];
    expect((await service.from("notification_outbox").delete().in("entity_id",ownedIds)).error).toBeNull();
    expect((await service.from("audit_logs").delete().in("entity_id",ownedIds)).error).toBeNull();
    expect((await service.from("jobs").delete().eq("company_id",companyId)).error).toBeNull();
    expect((await service.from("companies").delete().eq("id",companyId)).error).toBeNull();
    expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
