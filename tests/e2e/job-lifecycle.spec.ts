import { expect, test, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
function serviceClient() {
  if (url !== "http://127.0.0.1:55321") throw new Error("Lifecycle tests require isolated Supabase");
  const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], {encoding:"utf8",stdio:["ignore","pipe","ignore"]}));
  return createClient(url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function setup(context?: BrowserContext) {
  const service = serviceClient();
  const email = `lifecycle-${randomBytes(8).toString("hex")}@example.invalid`;
  const password = randomBytes(32).toString("base64url");
  const created = await service.auth.admin.createUser({email,password,email_confirm:true});
  if (created.error || !created.data.user) throw new Error("Lifecycle user setup failed");
  const ownerId=created.data.user.id, companyId=randomUUID(), jobId=randomUUID();
  const profile=await service.from("profiles").update({role:"employer",display_name:"Lifecycle owner"}).eq("id",ownerId);
  const company=await service.from("companies").insert({id:companyId,owner_id:ownerId,name:"Lifecycle fixture",city:"Oakland",state:"CA"});
  const template=await service.from("jobs").select("*").eq("id","bbbbbbbb-0000-0000-0000-000000000001").single();
  if(profile.error||company.error||template.error) throw new Error("Lifecycle fixture setup failed");
  const job=await service.from("jobs").insert({...template.data,id:jobId,company_id:companyId,title:"Lifecycle fixture job",boost:null,moderation_status:"approved",posted_at:new Date().toISOString(),expires_at:new Date(Date.now()+86400000).toISOString()});
  if(job.error) throw new Error("Lifecycle job setup failed");
  const cookies=new Map<string,string>();
  const owner=createServerClient(url,anonKey,{cookies:{getAll:()=>[...cookies].map(([name,value])=>({name,value})),setAll:items=>{for(const item of items) cookies.set(item.name,item.value);}}});
  const login=await owner.auth.signInWithPassword({email,password});
  if(login.error) throw new Error("Lifecycle login failed");
  if(context) await context.addCookies([...cookies].map(([name,value])=>({name,value,domain:"127.0.0.1",path:"/"})));
  return {service,owner,ownerId,jobId,companyId,async cleanup(){
    const notifications=await service.from("notification_outbox").delete().eq("entity_id",jobId);
    if(notifications.error) throw new Error("Lifecycle notification cleanup failed");
    await service.from("audit_logs").delete().eq("entity_id",jobId);
    const jobsDeleted=await service.from("jobs").delete().eq("id",jobId);
    const companyDeleted=await service.from("companies").delete().eq("id",companyId);
    const deleted=await service.auth.admin.deleteUser(ownerId);
    if(deleted.error||jobsDeleted.error||companyDeleted.error) throw new Error("Lifecycle cleanup failed");
  }};
}

test("owner edits through review, closes, resubmits, and cannot forge REST lifecycle fields",async({page,context})=>{
  const fixture=await setup(context);
  try {
    await page.goto("/employer/jobs");
    await expect(page.getByRole("link",{name:"편집 / Edit"})).toBeVisible();
    await page.getByRole("link",{name:"편집 / Edit"}).click();
    await expect(page.getByRole("heading",{name:"공고 편집 / Edit job"})).toBeVisible();
    await expect(page.getByLabel("공고 제목")).toHaveValue("Lifecycle fixture job");
    await page.getByLabel("공고 제목").fill("Lifecycle revised job");
    await page.locator('[name="complianceAcknowledgement"]').check();
    await page.getByRole("button",{name:"저장하고 재심사 / Save for review"}).click();
    await expect(page.getByRole("status")).toContainText("검토");
    let row=await fixture.service.from("jobs").select("moderation_status,updated_at,posted_at").eq("id",fixture.jobId).single();
    expect(row.data?.moderation_status).toBe("pending");
    const originalPosted=row.data?.posted_at;
    const anonymous=createClient(url,anonKey);
    expect((await anonymous.from("public_job_listings").select("id").eq("id",fixture.jobId)).data?.length).toBe(0);
    await page.goto("/employer/jobs");
    await page.getByRole("button",{name:"마감 / Close"}).click();
    await expect(page).toHaveURL(/result=updated/);
    row=await fixture.service.from("jobs").select("moderation_status,updated_at,posted_at").eq("id",fixture.jobId).single();
    expect(row.data?.moderation_status).toBe("expired");
    expect(row.data?.posted_at===originalPosted).toBe(true);
    const stale=await fixture.owner.rpc("transition_job",{target_job_id:fixture.jobId,command:"resubmit",expected_updated_at:"2000-01-01T00:00:00Z"});
    expect(stale.data?.[0]?.status).toBe("conflict");
    for(const payload of [{posted_at:"2100-01-01"},{expires_at:"2100-01-01"},{created_at:"1900-01-01"},{moderation_status:"approved"},{boost:"featured"},{company_id:"aaaaaaaa-0000-0000-0000-000000000001"}]) {
      const changed=await fixture.owner.from("jobs").update(payload).eq("id",fixture.jobId);
      expect(changed.error?.code).toBe("42501");
    }
    await page.getByRole("button",{name:"재심사 요청 / Resubmit"}).click();
    await expect(page.getByText("검수 대기",{exact:true})).toBeVisible();
  } finally { await page.goto("about:blank").catch(()=>{}); await fixture.cleanup(); }
});

test("a real INSERT waiting behind close rechecks the committed state",async()=>{
  const fixture=await setup();
  const seeker=await fixture.service.auth.admin.createUser({email:`race-${randomBytes(8).toString("hex")}@example.invalid`,password:randomBytes(32).toString("base64url"),email_confirm:true});
  if(!seeker.data.user) throw new Error("Race seeker setup failed");
  const connection="postgresql://postgres:postgres@127.0.0.1:55322/postgres";
  let closer: ReturnType<typeof spawn> | undefined;
  const run=(sql:string)=>new Promise<{code:number|null;output:string}>(resolve=>{
    const proc=spawn("psql",[connection,"-X","-v","ON_ERROR_STOP=1","-At"],{stdio:["pipe","pipe","pipe"]});
    const timeout=setTimeout(()=>proc.kill(),10000);
    let output="";proc.stdout.on("data",c=>output+=c);proc.stderr.on("data",c=>output+=c);proc.on("close",code=>{clearTimeout(timeout);resolve({code,output});});proc.stdin.end(sql);
  });
  try {
    closer=spawn("psql",[connection,"-X","-v","ON_ERROR_STOP=1","-At"],{stdio:["pipe","pipe","pipe"]});
    let closeOutput="";
    const locked=new Promise<void>(resolve=>closer!.stdout!.on("data",c=>{closeOutput+=c;if(closeOutput.includes("LOCKED")) resolve();}));
    const done=new Promise<number|null>(resolve=>closer!.on("close",resolve));
    closer.stderr!.resume();
    closer.stdin!.write(`begin; select set_config('request.jwt.claims','{"sub":"${fixture.ownerId}","role":"authenticated","aal":"aal1"}',true); set local role authenticated; select status from public.transition_job('${fixture.jobId}','close',(select updated_at from public.jobs where id='${fixture.jobId}')); select 'LOCKED';\n`);
    await locked;
    const insert=run(`select set_config('application_name','b2-admission-waiter',false); begin; select set_config('request.jwt.claims','{"sub":"${seeker.data.user.id}","role":"authenticated","aal":"aal1"}',true); set local role authenticated; insert into public.applications(job_id,seeker_id) values('${fixture.jobId}','${seeker.data.user.id}'); commit;`);
    await expect.poll(async()=>{
      const state=await run("select count(*) from pg_stat_activity where application_name='b2-admission-waiter' and wait_event_type='Lock';");
      return state.output.trim();
    }).toBe("1");
    closer.stdin!.end("commit;\n");
    expect(await done).toBe(0);
    const admitted=await insert;
    expect(admitted.code).not.toBe(0);
    expect(admitted.output.includes("Application not allowed")).toBe(true);
    const count=await fixture.service.from("applications").select("id",{count:"exact",head:true}).eq("job_id",fixture.jobId);
    expect(count.count).toBe(0);
  } finally {
    closer?.kill();
    await fixture.service.auth.admin.deleteUser(seeker.data.user.id);
    await fixture.cleanup();
  }
});
