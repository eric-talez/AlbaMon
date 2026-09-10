import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), update: vi.fn(), eq: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/auth/guards", async (original) => ({ ...await original<object>(), requireUser: mocks.user }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ from: () => ({ update: mocks.update }) }) }));
import { updateOwnProfile } from "@/app/dashboard/profile/actions";
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "self", isDev: false });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockReturnValue({ select: () => ({ maybeSingle: mocks.single }) });
  mocks.single.mockResolvedValue({ data: { id: "self" }, error: null });
});
test.each(["", "  ", "x".repeat(81)])("rejects invalid display name without writing", async (displayName) => {
  expect(await updateOwnProfile(form({ displayName }))).toEqual({ status: "error", message: "표시 이름은 1~80자로 입력해 주세요." });
  expect(mocks.update).not.toHaveBeenCalled();
});
test("only updates the authenticated self's display name and city", async () => {
  expect(await updateOwnProfile(form({ displayName: " Kim ", city: " LA ", id: "other", role: "admin", email: "spoof@example.invalid", account_status: "active" }))).toMatchObject({ status: "success" });
  expect(mocks.user).toHaveBeenCalledWith("/dashboard/profile");
  expect(mocks.update).toHaveBeenCalledWith({ display_name: "Kim", city: "LA" });
  expect(mocks.eq).toHaveBeenCalledWith("id", "self");
});
test("accepts the 80 character boundary and preserves city when omitted", async () => {
  expect(await updateOwnProfile(form({ displayName: "x".repeat(80) }))).toMatchObject({ status: "success" });
  expect(mocks.update).toHaveBeenCalledWith({ display_name: "x".repeat(80) });
});
test.each([{ data: null, error: { message: "internal detail" } }, { data: null, error: null }])("reports a failed or empty DB update safely", async (result) => {
  mocks.single.mockResolvedValue(result);
  const state = await updateOwnProfile(form({ displayName: "Kim" }));
  expect(state.status).toBe("error");
  expect(state.message).not.toContain("internal detail");
});

test("saves only own notification preference and ignores forged suppression", async () => {
  expect(await updateOwnProfile(form({ displayName: "Kim", emailNotificationsEnabled: "false", suppressed_email: "false", id: "other" }))).toMatchObject({ status: "success" });
  expect(mocks.update).toHaveBeenCalledWith({ display_name: "Kim", email_notifications_enabled: false });
  expect(mocks.eq).toHaveBeenCalledWith("id", "self");
});
