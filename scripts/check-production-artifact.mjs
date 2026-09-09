import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const origin = "http://127.0.0.1:3100";
const childEnv = {
  ...process.env,
  CI: "1",
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://your-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "your-anon-key",
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Production server did not become ready within 30 seconds");
}

await run("npm", ["run", "build"], {
  cwd: process.cwd(),
  env: childEnv,
  stdio: "inherit",
});

const server = spawn("npm", ["run", "start", "--", "-p", "3100"], {
  cwd: process.cwd(),
  detached: true,
  env: childEnv,
  stdio: "inherit",
});

try {
  await waitForServer();

  const sample = await fetch(`${origin}/jobs/kw-001`);
  const sampleHtml = await sample.text();
  assert.notEqual(sample.status, 200, "sample detail must never be public");
  assert.equal(sampleHtml.includes("강남 키친"), false);

  const malformed = await fetch(`${origin}/jobs/not-a-uuid`);
  assert.equal(malformed.status, 404, "malformed job ids must return 404");

  console.log(
    `Production artifact safe: sample=${sample.status}, malformed=${malformed.status}`,
  );
} finally {
  if (server.pid) process.kill(-server.pid, "SIGTERM");
}
