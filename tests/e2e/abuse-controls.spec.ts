import { policyAcceptanceIdentity } from "../../src/lib/policy-publication.mjs";
import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID, createHmac } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase()].map(char => alphabet.indexOf(char).toString(2).padStart(5,"0")).join("");
  const key = Buffer.from(bits.match(/.{8}/g)!.map(byte => parseInt(byte,2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest = createHmac("sha1",key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).toString().padStart(6,"0");
}

test("local moderation rehearsal: report pause, account suspension, old JWT denial, history, separate restore and audit", async ({page,context,browser}) => {
  test.setTimeout(90_000);
  if (url !== "http://127.0.0.1:55321") throw new Error("C2 requires isolated local Supabase");
  const config = JSON.parse(execFileSync("supabase",["status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}));
  const service = createClient(url,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const userIds: string[] = [], companyId=randomUUID(), jobId=randomUUID(), applicationId=randomUUID(), reportId=randomUUID();
  const pendingIds=Array.from({length:21},()=>randomUUID());
  const ownedIds=()=>[...userIds,companyId,jobId,applicationId,reportId,...pendingIds];
  const ownerContext=await browser.newContext();
  async function user(role: "admin" | "employer" | "seeker", target?: BrowserContext) {
    const email=`c2-${randomBytes(8).toString("hex")}@example.invalid`, password=randomBytes(32).toString("base64url");
    const created=await service.auth.admin.createUser({email,password,email_confirm:true});
    if (created.error || !created.data.user) throw new Error("C2 Auth setup failed");
    const id=created.data.user.id;userIds.push(id);
    expect((await service.from("profiles").update({role,display_name:`C2 ${role}`,created_at:"1901-01-01T00:00:00Z"}).eq("id",id)).error).toBeNull();
    const cookies=new Map<string,string>();
    const client=createServerClient(url,anon,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>{for(const item of items) cookies.set(item.name,item.value);}}});
    if((await client.auth.signInWithPassword({email,password})).error) throw new Error("C2 Auth login failed");
    async function sync() {if(target) await target.addCookies([...cookies].map(([name,value])=>({name,value,domain:"127.0.0.1",path:"/"})));}
    if ((await client.rpc("acknowledge_policies", { terms: "ca-launch-v1", agree_terms: true, privacy_notice: "ca-launch-v1", confirm_privacy_notice: true, publication_identity: policyAcceptanceIdentity() })).error) throw new Error("Fixture self acknowledgement failed");
    await sync();return {id,email,client,sync};
  }
  try {
    const admin=await user("admin",context), owner=await user("employer",ownerContext), seeker=await user("seeker");
    expect((await service.from("companies").insert({id:companyId,owner_id:owner.id,name:"C2 rehearsal company",city:"Oakland",is_verified:true})).error).toBeNull();
    const template=await service.from("jobs").select("*").eq("id","bbbbbbbb-0000-0000-0000-000000000001").single();
    expect(template.error).toBeNull();
    expect((await service.from("jobs").insert({...template.data,id:jobId,company_id:companyId,title:"C2 rehearsal job",boost:null,moderation_status:"approved",expires_at:new Date(Date.now()+86400000).toISOString()})).error).toBeNull();
    expect((await service.from("jobs").insert(pendingIds.map((id,index)=>({...template.data,id,company_id:companyId,title:`C2 pending ${index}`,boost:null,posted_at:null,expires_at:null,moderation_status:"pending",created_at:new Date(Date.UTC(1901,0,1,0,0,index)).toISOString()})))).error).toBeNull();
    expect((await seeker.client.from("applications").insert({id:applicationId,job_id:jobId,seeker_id:seeker.id})).error).toBeNull();
    expect((await seeker.client.from("reports").insert({id:reportId,job_id:jobId,reporter_id:seeker.id,reason:"misleading_or_suspicious",details:"Local rehearsal evidence"})).error).toBeNull();
    expect((await owner.client.from("messages").insert({application_id:applicationId,sender_id:owner.id,body:"Existing history"})).error).toBeNull();
    expect((await admin.client.rpc("suspend_account",{target_user_id:owner.id,reason:"AAL1 attempt"})).error?.code).toBe("42501");
    const factor=await admin.client.auth.mfa.enroll({factorType:"totp",friendlyName:"C2 local rehearsal"});
    if(factor.error || !factor.data.totp) throw new Error("C2 MFA enrollment failed");
    const challenge=await admin.client.auth.mfa.challenge({factorId:factor.data.id});
    if(challenge.error) throw new Error("C2 MFA challenge failed");
    const verified=await admin.client.auth.mfa.verify({factorId:factor.data.id,challengeId:challenge.data.id,code:totp(factor.data.totp.secret)});
    if(verified.error) throw new Error("C2 MFA verification failed");
    await admin.sync();
    await page.goto("/admin/jobs");
    await expect(page.locator("main > ul > li")).toHaveCount(20);
    await page.getByRole("link",{name:"다음 / Next →",exact:true}).click();
    await expect(page.getByRole("heading",{name:"C2 pending 20",exact:true})).toBeVisible();
    await page.goto("/admin/reports");
    const reportCard=page.locator("main > ul > li").filter({hasText:"C2 rehearsal job"});
    await expect(reportCard).toContainText("회사 확인: 확인됨");
    await expect(reportCard.getByRole("link",{name:"공개 공고 보기 / Public job"})).toHaveAttribute("href",`/jobs/${jobId}`);
    await reportCard.getByLabel("공고 중지 사유 / Pause reason").fill("Local verified misleading terms; no reporter identity");
    await reportCard.getByRole("button",{name:"공고 중지 후 검토 완료 / Pause and review"}).click();
    await expect.poll(async()=>(await service.from("reports").select("status").eq("id",reportId).single()).data?.status).toBe("reviewed");
    expect((await service.from("jobs").select("moderation_status").eq("id",jobId).single()).data?.moderation_status).toBe("paused");
    const pauseAudit=await admin.client.from("audit_logs").select("metadata").eq("entity_id",jobId).eq("action","job.paused");
    expect(pauseAudit.data).toHaveLength(1);
    expect(pauseAudit.data?.[0]?.metadata.reason).toBe("Local verified misleading terms; no reporter identity");
    await page.goto(`/admin/reports?status=reviewed`);
    await reportCard.getByRole("link", { name: "관련 공고 검토 / Review job" }).click();
    await expect(page.locator("main > ul > li")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "C2 rehearsal job", exact: true })).toBeVisible();
    await expect(page.locator("main > ul > li")).toContainText("중지");
    await page.goto("/admin/users");
    const account=page.locator("main > ul > li").filter({hasText:owner.email});
    await account.getByLabel("처리 사유 / Reason (필수)").fill("Local repeated abuse investigation");
    await account.getByRole("button",{name:"계정 정지 / Suspend",exact:true}).click();
    await expect.poll(async()=>(await service.from("profiles").select("account_status").eq("id",owner.id).single()).data?.account_status).toBe("suspended");
    const denied=await owner.client.from("messages").insert({application_id:applicationId,sender_id:owner.id,body:"Old JWT attempt"});
    expect(denied.error?.code).toBe("42501");
    expect((await owner.client.rpc("list_employer_applications")).data).toHaveLength(1);
    expect((await owner.client.from("messages").select("body").eq("application_id",applicationId)).data?.[0]?.body).toBe("Existing history");
    const ownerPage=await ownerContext.newPage();
    await ownerPage.goto(`/employer/applications/${applicationId}/messages`);
    await expect(ownerPage.getByText("Existing history",{exact:true})).toBeVisible();
    await ownerPage.getByLabel("새 메시지",{exact:true}).fill("Suspended browser attempt");
    await ownerPage.getByRole("button",{name:"메시지 보내기",exact:true}).click();
    await expect(ownerPage.getByRole("alert").filter({ hasText: "계정이 정지" })).toContainText("계정이 정지");
    expect((await service.from("jobs").select("id").eq("company_id",companyId).in("moderation_status",["approved","pending"])).data).toHaveLength(0);
    await page.goto("/admin/users?status=suspended");
    await expect(page.getByText("사유: Local repeated abuse investigation", { exact: true })).toBeVisible();
    const suspended=page.locator("main > ul > li").filter({hasText:owner.email});
    await suspended.getByLabel("처리 사유 / Reason (필수)").fill("Local appeal accepted; requires fresh job review");
    await suspended.getByRole("button",{name:"정지 해제 / Restore",exact:true}).click();
    await expect.poll(async()=>(await service.from("profiles").select("account_status").eq("id",owner.id).single()).data?.account_status).toBe("active");
    expect((await createClient(url,anon).from("public_job_listings").select("id").eq("id",jobId)).data).toHaveLength(0);
    const audit=await admin.client.from("audit_logs").select("action,actor_id,metadata").eq("entity_id",owner.id).in("action",["account.suspended","account.restored"]).order("created_at");
    expect(audit.data?.map(row=>row.action)).toEqual(["account.suspended","account.restored"]);
    expect(audit.data?.every(row=>row.actor_id===admin.id && row.metadata.reason)).toBe(true);
    const employerReports=await owner.client.from("reports").select("reporter_id").eq("id",reportId);
    expect(employerReports.data).toHaveLength(0);
  } finally {
    await page.goto("about:blank").catch(()=>{});await ownerContext.close();
    expect((await service.from("notification_outbox").delete().in("entity_id",ownedIds())).error).toBeNull();
    expect((await service.from("audit_logs").delete().in("entity_id",ownedIds())).error).toBeNull();
    expect((await service.from("jobs").delete().in("id",[jobId,...pendingIds])).error).toBeNull();
    expect((await service.from("companies").delete().eq("id",companyId)).error).toBeNull();
    for(const id of userIds) expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
    expect((await service.from("notification_outbox").select("id").in("entity_id",ownedIds())).data).toHaveLength(0);
    expect((await service.from("audit_logs").select("id").in("entity_id",ownedIds())).data).toHaveLength(0);
  }
});
