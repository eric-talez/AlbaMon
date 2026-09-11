import { policyAcceptanceIdentity } from "@/lib/policy-publication.mjs";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { getOwnedEmployerJob } from "@/lib/db/employer-jobs";
import { JobForm } from "../../new/JobForm";
export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("employer", "/employer/jobs");
  const { id } = await params;
  const job = await getOwnedEmployerJob(id, user.id);
  if (!job) notFound();
  return <main className="mx-auto w-full max-w-3xl px-4 py-10"><h1 className="text-2xl font-bold">공고 편집 / Edit job</h1><JobForm policyIdentity={policyAcceptanceIdentity()} companies={[]} job={job} /></main>;
}
