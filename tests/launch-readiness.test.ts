import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
   const migrationsDir=join(root,"supabase/migrations");
   const filename="20990101000000_future.sql";
   writeFileSync(join(migrationsDir,filename),"select 1;");
   const undocumented=gate(root);
   expect(undocumented.status).toBe(1);
   expect(undocumented.stderr).toContain(`does not document migration: ${filename}`);

   const deploymentPath=join(root,"docs/DEPLOYMENT.md");
   const count=readdirSync(migrationsDir).filter(name=>name.endsWith(".sql")).length;
   const deployment=readFileSync(deploymentPath,"utf8")
     .replace(/The current source contains \d+ migrations/,`The current source contains ${count} migrations`);
   writeFileSync(deploymentPath,`${deployment}\nFuture additive migration: ${filename}\n`);
   expect(gate(root).status).toBe(0);

   writeFileSync(join(migrationsDir,"20990101000000_duplicate.sql"),"select 2;");
   const duplicate=gate(root);
   expect(duplicate.status).toBe(1);
   expect(duplicate.stderr).toContain("duplicate migration history version");
 }finally{rmSync(root,{recursive:true,force:true});}
});
