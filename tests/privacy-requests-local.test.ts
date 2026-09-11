import { test, expect, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processPrivacyRequest } from "../scripts/privacy-request.mjs";
import { runNotificationBatch } from "@/lib/notifications/worker";

test.skipIf(process.env.RUN_PRIVACY_LOCAL !== "true")("local verified-account request: bounded export, cascade stop, preserve participants, suppression, empty-scope toy deletion and disposal", async () => {
  const config=JSON.parse(execFileSync("supabase",["status","-o","json"],{stdio:["ignore","pipe","ignore"],encoding:"utf8"}));
  if(config.API_URL!=="http://127.0.0.1:55321") throw new Error("Owned local stack only");
  const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  expect((await service.from("notification_outbox").select("id",{head:true,count:"exact"})).count).toBe(0);
  const ids:string[]=[], companyId=randomUUID(), jobId=randomUUID(), applicationId=randomUUID(), messageId=randomUUID(), requestId=randomUUID();
  const folder=await mkdtemp(join(tmpdir(),"c3-private-"));
  const nativeFetch=globalThis.fetch;
  const owned=()=>[...ids,companyId,jobId,applicationId,messageId];
  const check=(r:{error:unknown})=>{if(r.error) throw new Error("Privacy rehearsal operation failed");};
  async function account() {
    const email=`privacy-${randomUUID()}@example.invalid`,password=randomBytes(32).toString("base64url");
    const created=await service.auth.admin.createUser({email,password,email_confirm:true});check(created);
    const id=created.data.user!.id;ids.push(id);
    const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    check(await client.auth.signInWithPassword({email,password}));
    const verified=await client.auth.getUser();check(verified);
    expect(verified.data.user?.id===id && !!verified.data.user?.email_confirmed_at).toBe(true);
    check(await client.rpc("acknowledge_policies",{terms:"ca-launch-v1",agree_terms:true,privacy_notice:"ca-launch-v1",confirm_privacy_notice:true}));
    return {id,email,client};
  }
  try {
    const owner=await account(), seeker=await account(), orphan=await account();
    check(await service.from("profiles").update({role:"employer"}).eq("id",owner.id));
    check(await service.from("companies").insert({id:companyId,owner_id:owner.id,name:"Privacy toy company",city:"Oakland"}));
    const template=await service.from("jobs").select("*").eq("id","bbbbbbbb-0000-0000-0000-000000000001").single();check(template);
    check(await service.from("jobs").insert({...template.data,id:jobId,company_id:companyId,boost:null,moderation_status:"approved",expires_at:new Date(Date.now()+86400000).toISOString()}));
    check(await seeker.client.from("applications").insert({id:applicationId,seeker_id:seeker.id,job_id:jobId,cover_note:"PRIVATE_APPLICANT_NOTE"}));
    check(await seeker.client.from("messages").insert({id:messageId,application_id:applicationId,sender_id:seeker.id,body:"PRIVATE_OTHER_MESSAGE"}));
    check(await owner.client.from("messages").insert({application_id:applicationId,sender_id:owner.id,body:"My own message"}));
    // Ordinary API callers cannot invoke broad operational inspection/export.
    expect((await owner.client.rpc("privacy_request_access",{subject_id:seeker.id})).error?.code).toBe("42501");
    const record={requestId,subjectId:owner.id,verifiedUserId:owner.id,identityEvidenceReference:"local authenticated getUser verified",scopeReviewReference:"owned toy access/suppression only",allowedActions:["inspect","export","suppress"]};
    await expect(processPrivacyRequest(service,{...record,verifiedUserId:seeker.id},"export",join(folder,"denied.json"))).rejects.toThrow();
    const inspected=await processPrivacyRequest(service,record,"inspect");
    expect(inspected).toMatchObject({counts:{third_party_applications:1}});
    const impact=await service.rpc("privacy_request_impact",{subject_id:owner.id});
    expect(impact.error).toBeNull();
    expect(impact.data).toMatchObject({companies:1,jobs:1,applications:1,third_party_applications:1,messages:2,third_party_messages:1});
    const seekerImpact=await service.rpc("privacy_request_impact",{subject_id:seeker.id});check(seekerImpact);
    expect(seekerImpact.data).toMatchObject({applications:1,messages:2,third_party_messages:1});
    const exported=await service.rpc("privacy_request_access",{subject_id:owner.id});check(exported);
    const text=JSON.stringify(exported.data);
    expect(text.includes(seeker.email)||text.includes("PRIVATE_APPLICANT_NOTE")||text.includes("PRIVATE_OTHER_MESSAGE")||text.includes("access_token")).toBe(false);
    expect(text.includes("My own message")).toBe(true);
    const path=join(folder,`${requestId}.json`);
    const prepared=await processPrivacyRequest(service,record,"export",path);
    expect(prepared).toMatchObject({manualRedactionReviewRequired:true});
    if (!("candidateExportSha256" in prepared)) throw new Error("Candidate export evidence missing");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const digest=createHash("sha256").update(await readFile(path)).digest("hex");expect(digest).toBe(prepared.candidateExportSha256);
    // Prove the actual local FK cascade, then ROLLBACK before any participant
    // data is lost. This is a toy fixture probe, not a production delete recipe.
    const cascadeCounts=execFileSync("psql",[config.DB_URL,"-X","-qAt","-v","ON_ERROR_STOP=1"],{encoding:"utf8",stdio:["pipe","pipe","pipe"],input:`begin; prepare toy_cascade(uuid) as delete from auth.users where id=$1; execute toy_cascade('${owner.id}'); select count(*) from public.applications where id='${applicationId}'; select count(*) from public.messages where application_id='${applicationId}'; rollback;`}).trim();
    expect(cascadeCounts).toBe("0\n0");
    // No employer/applicant deletion: linked records remain intact pending real retention decisions.
    expect((await service.from("applications").select("id").eq("id",applicationId)).data).toHaveLength(1);
    expect((await service.from("messages").select("id").eq("application_id",applicationId)).data).toHaveLength(2);
    expect(await processPrivacyRequest(service,record,"suppress")).toMatchObject({suppressed:true});
    check(await service.from("profiles").update({suppressed_email:true}).eq("id",seeker.id));
    vi.stubGlobal("fetch",(input:string|URL|Request,init?:RequestInit)=>{
      if(new URL(input instanceof Request?input.url:String(input)).origin!==config.API_URL) throw new Error("No external delivery allowed");
      return nativeFetch(input,init);
    });
    for(const [key,value] of Object.entries({NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:config.API_URL,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY,NEXT_PUBLIC_SITE_URL:"https://privacy.example.invalid",EMAIL_PROVIDER:"resend",EMAIL_NOTIFICATIONS_ENABLED:"true",EMAIL_ENVIRONMENT:"staging",EMAIL_STAGING_ALLOWLIST:owner.email,EMAIL_FROM:"sender@example.invalid",RESEND_API_KEY:"re_local_unused",RESEND_WEBHOOK_SECRET:"whsec_local_unused",CRON_SECRET:"local-privacy-unused"})) vi.stubEnv(key,String(value));
    const delivery=await runNotificationBatch();
    expect(delivery.sent).toBe(0);expect(delivery.suppressed).toBeGreaterThan(0);
    const emptyImpact=await service.rpc("privacy_request_impact",{subject_id:orphan.id});check(emptyImpact);
    expect(emptyImpact.data.auth_users).toBe(1);expect(emptyImpact.data.profiles).toBe(1);
    expect(Object.entries(emptyImpact.data).filter(([k])=>!["auth_users","profiles"].includes(k)).every(([,v])=>v===0)).toBe(true);
    // Only this owned toy fixture has a verified zero-dependent scope. This is
    // NOT production retention approval or proof of linked-account preservation.
    check(await service.auth.admin.deleteUser(orphan.id));
    expect((await service.auth.admin.getUserById(orphan.id)).error?.status).toBe(404);
    await rm(path);
    await expect(stat(path)).rejects.toThrow();
  } finally {
    vi.unstubAllGlobals();vi.unstubAllEnvs();
    check(await service.from("notification_outbox").delete().in("entity_id",owned()));
    check(await service.from("audit_logs").delete().in("entity_id",owned()));
    check(await service.from("jobs").delete().eq("id",jobId));
    check(await service.from("companies").delete().eq("id",companyId));
    for(const id of ids) { const found=await service.auth.admin.getUserById(id);if(found.data.user) check(await service.auth.admin.deleteUser(id)); }
    await rm(folder,{recursive:true,force:true});
    expect((await service.from("notification_outbox").select("id",{head:true,count:"exact"})).count).toBe(0);
    expect((await service.from("audit_logs").select("id").in("entity_id",owned())).data).toHaveLength(0);
  }
},30000);
