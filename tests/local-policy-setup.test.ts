import { expect, test } from "vitest";
import { activateLocalPolicy } from "../scripts/activate-local-policy.mjs";
const initial="draft:23194732385dbc6318df4713775a0ae2ce482e69cd45324ca94d95beb9d821f7";
const status={API_URL:"http://127.0.0.1:55321",DB_URL:"postgresql://postgres:postgres@127.0.0.1:55322/postgres",ANON_KEY:"anon-test",SERVICE_ROLE_KEY:"service-test"};
test.each([`draft:${"a".repeat(64)}`,`reviewed:${"b".repeat(64)}`])("fresh isolated stack can activate current bundle %s without acknowledgement writes",async next=>{
 let pointer=initial; const paths:string[]=[];
 const fetcher=async(input:RequestInfo | URL,init:RequestInit = {})=>{
   const url=String(input);
   paths.push(new URL(url).pathname);
   if(url.endsWith("activate_policy_publication")) {
     expect(JSON.parse(init.body as string)).toEqual({expected_identity:initial,next_identity:next});
     expect(new Headers(init.headers).get("apikey")).toBe("service-test"); pointer=next;return new Response(null,{status:204});
   }
   return Response.json(pointer);
 };
 await activateLocalPolicy(status,next,fetcher);
 expect(pointer).toBe(next);
 expect(paths).toEqual(["/rest/v1/rpc/current_policy_identity","/rest/v1/rpc/activate_policy_publication","/rest/v1/rpc/current_policy_identity"]);
 paths.length=0;await activateLocalPolicy(status,next,fetcher);expect(paths).toHaveLength(1);
});
test("refuses foreign ports, hosted API or an already transitioned different pointer",async()=>{
 for(const patch of [{API_URL:"https://hosted.supabase.co"},{DB_URL:"postgresql://postgres:postgres@127.0.0.1:54322/postgres"}]) await expect(activateLocalPolicy({...status,...patch},initial,()=>{throw Error("must not connect");})).rejects.toThrow("Owned isolated");
 await expect(activateLocalPolicy(status,initial,async()=>Response.json(`reviewed:${"c".repeat(64)}`))).rejects.toThrow("explicit reviewed transition");
});
