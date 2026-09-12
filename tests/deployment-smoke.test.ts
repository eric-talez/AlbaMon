import { expect, test } from "vitest";
import { smokeDeployment } from "../scripts/smoke-deployment.mjs";
const env={NODE_ENV:"test" as const,DEPLOYMENT_ORIGIN:"https://candidate.vercel.app",NEXT_PUBLIC_SITE_URL:"https://jobs.k-work.test",VERCEL_AUTOMATION_BYPASS_SECRET:"synthetic-protection-only",CRON_SECRET:"never-send-valid-worker-secret"};
function responses(patch: Record<string, Response> = {}) {
  const calls: {url:string;init:RequestInit}[]=[];
  return {calls, fetcher: async (url: RequestInfo | URL,init: RequestInit = {})=>{
    calls.push({url:String(url),init});const path=new URL(String(url)).pathname;
    if(patch[path]) return patch[path].clone();
    if(path==="/api/health") return Response.json({status:"ok",service:"k-work-us",checks:{siteUrl:"configured",supabase:"configured",email:"configured"}});
    if(path==="/api/ready") return Response.json({status:"ok"},{headers:{"cache-control":"no-store"}});
    if(path==="/api/internal/notifications") return Response.json({error:"Unauthorized"},{status:401});
    if(path==="/robots.txt") return new Response("User-Agent: *\nAllow: /\nSitemap: https://jobs.k-work.test/sitemap.xml");
    if(path==="/sitemap.xml") return new Response('<urlset><url><loc>https://jobs.k-work.test/jobs</loc></url></urlset>');
    if(path==="/jobs/kw-001") return new Response("missing",{status:404});
    return new Response('<html><link rel="canonical" href="https://jobs.k-work.test/jobs" /></html>');
  }};
}
test("candidate requests retain production canonical and never authenticate delivery",async()=>{
 const fake=responses();await smokeDeployment("production",env,fake.fetcher);
 expect(fake.calls.every(c=>c.url.startsWith("https://candidate.vercel.app/")&&c.init.method==="GET"&&c.init.redirect==="error")).toBe(true);
 expect(JSON.stringify(fake.calls)).not.toContain(env.CRON_SECRET);
 expect(fake.calls.filter(c=>c.url.endsWith("/api/internal/notifications")).map(c=>new Headers(c.init.headers).get("authorization"))).toEqual([null,"Smoke invalid"]);
 expect(fake.calls.every(c=>new Headers(c.init.headers).get("x-vercel-protection-bypass")===env.VERCEL_AUTOMATION_BYPASS_SECRET)).toBe(true);
});
test.each([
 ["/jobs",new Response('<link rel="canonical" href="https://candidate.vercel.app/jobs">')],
 ["/jobs",new Response('강남 키친')],
 ["/jobs",new Response('<link rel="canonical" href="https://jobs.k-work.test/jobs">Koreatown Kitchen Collective')],
 ["/api/ready",Response.json({status:"unavailable"},{status:503})],
 ["/api/internal/notifications",Response.json({ok:true})],
 ["/jobs",new Response("redirect",{status:307,headers:{location:"https://elsewhere.test"}})],
 ["/sitemap.xml",new Response('<urlset><loc>https://elsewhere.test/jobs</loc></urlset>')],
])("fails closed for %s",async(path,response)=>{await expect(smokeDeployment("production",env,responses({[path as string]:response as Response}).fetcher)).rejects.toThrow();});
test("staging requires both blanket HTML noindex and robots exclusion",async()=>{
 const staging={...env,NEXT_PUBLIC_SITE_URL:"https://staging.k-work.test"};
 const patch={"/jobs":new Response('<link rel="canonical" href="https://staging.k-work.test/jobs">',{headers:{"x-robots-tag":"noindex, nofollow"}}),"/robots.txt":new Response("User-Agent: *\nDisallow: /"),"/sitemap.xml":new Response('<urlset><loc>https://staging.k-work.test/jobs</loc></urlset>')};
 await expect(smokeDeployment("staging",staging,responses(patch).fetcher)).resolves.toBeUndefined();
 await expect(smokeDeployment("staging",staging,responses({...patch,"/jobs":new Response('<link rel="canonical" href="https://staging.k-work.test/jobs">')}).fetcher)).rejects.toThrow();
});
