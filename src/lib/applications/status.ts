import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/types";

export const EMPLOYER_APPLICATION_STATUSES = APPLICATION_STATUSES.filter(
  (status) => status !== "withdrawn",
);

export function canEmployerChangeStatus(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return from !== "withdrawn" && (EMPLOYER_APPLICATION_STATUSES as readonly string[]).includes(to);
}
