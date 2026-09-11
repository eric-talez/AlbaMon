import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
function fixture() {
 const root=mkdtempSync(join(tmpdir(),"launch-docs-"));
 mkdirSync(join(root,"supabase"),{recursive:true});
 // Copy required repository surfaces; never copy .env or local credentials.
 for(const name of ["docs","package.json","vercel.json",".github","supabase/migrations"]) cpSync(name,join(root,name),{recursive:true});
 return root;
}
function gate(root:string) { return spawnSync(process.execPath,["scripts/verify-beta-readiness.mjs",root],{encoding:"utf8"}); }
test("offline gate requires tracked current environment evidence",()=>{
 const root=fixture();try {rmSync(join(root,"docs/launch-evidence/environments.md"),{force:true});expect(gate(root).status).toBe(1);}finally{rmSync(root,{recursive:true,force:true});}
});
test("offline gate accepts additive migrations but rejects duplicate history versions",()=>{
 const root=fixture();try {
   writeFileSync(join(root,"supabase/migrations/20990101000000_future.sql"),"select 1;");expect(gate(root).status).toBe(0);
   writeFileSync(join(root,"supabase/migrations/20990101000000_duplicate.sql"),"select 2;");expect(gate(root).status).toBe(1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
