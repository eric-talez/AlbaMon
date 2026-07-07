import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/db/employer-access-requests", () => ({
  createEmployerAccessRequest: vi.fn(),
  reviewEmployerAccessRequest: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/guards";
import {
  createEmployerAccessRequest,
  reviewEmployerAccessRequest,
} from "@/lib/db/employer-access-requests";
import { submitEmployerAccessRequestForUser } from "@/lib/employer-access/actions";
import { parseEmployerAccessRequestForm } from "@/lib/employer-access/validation";
import { reviewEmployerRequest } from "@/app/admin/employer-requests/actions";

const mockRequireUser = vi.mocked(requireUser);
const mockRequireRole = vi.mocked(requireRole);
const mockCreate = vi.mocked(createEmployerAccessRequest);
const mockReview = vi.mocked(reviewEmployerAccessRequest);
const mockRevalidate = vi.mocked(revalidatePath);

const REQUEST_ID = "123e4567-e89b-12d3-a456-426614174000";

function seeker() {
  return {
    id: "seeker-1",
    email: "seeker@example.com",
    role: "seeker" as const,
    isDev: false,
  };
}

function validForm(): FormData {
  const formData = new FormData();
  formData.set("businessName", "K-Work Cafe");
  formData.set("contactName", "Eric Kim");
  formData.set("phone", "213-555-0100");
  formData.set("website", "https://kworkcafe.example");
  formData.set("city", "Los Angeles");
  formData.set("state", "ca");
  formData.set("reason", "We are hiring baristas.");
  return formData;
}

beforeEach(() => {
  mockRequireUser.mockResolvedValue(seeker());
  mockRequireRole.mockResolvedValue({
    id: "admin-1",
    email: "admin@example.com",
    role: "admin",
    isDev: false,
  });
});

afterEach(() => vi.clearAllMocks());

describe("parseEmployerAccessRequestForm", () => {
  it("requires business name, contact name, city, and a two-letter state", () => {
    for (const missing of ["businessName", "contactName", "city"]) {
      const formData = validForm();
      formData.set(missing, "   ");
      const parsed = parseEmployerAccessRequestForm(formData);
      expect(parsed.ok).toBe(false);
    }

    const badState = validForm();
    badState.set("state", "California");
    expect(parseEmployerAccessRequestForm(badState).ok).toBe(false);
  });

  it("normalizes optional fields and uppercases the state", () => {
    const formData = validForm();
    formData.set("phone", "");
    formData.set("website", "");
    formData.set("reason", "");
    const parsed = parseEmployerAccessRequestForm(formData);
    expect(parsed).toEqual({
      ok: true,
      value: {
        businessName: "K-Work Cafe",
        contactName: "Eric Kim",
        phone: null,
        website: null,
        city: "Los Angeles",
        state: "CA",
        reason: null,
      },
    });
  });

  it("rejects non-http websites and over-long reasons", () => {
    const badSite = validForm();
    badSite.set("website", "ftp://example.com");
    expect(parseEmployerAccessRequestForm(badSite).ok).toBe(false);

    const longReason = validForm();
    longReason.set("reason", "a".repeat(1001));
    expect(parseEmployerAccessRequestForm(longReason).ok).toBe(false);
  });
});

describe("submitEmployerAccessRequestForUser", () => {
  it("submits a parsed request for a seeker and refreshes the admin queue", async () => {
    mockCreate.mockResolvedValue({ status: "ok", requestId: "req-1" });

    const state = await submitEmployerAccessRequestForUser(validForm());
    expect(state.status).toBe("success");
    expect(state.message).toContain("승인이 보장되지는 않습니다");
    expect(mockRequireUser).toHaveBeenCalledWith("/employer/request-access");
    expect(mockCreate).toHaveBeenCalledWith("seeker-1", {
      businessName: "K-Work Cafe",
      contactName: "Eric Kim",
      phone: "213-555-0100",
      website: "https://kworkcafe.example",
      city: "Los Angeles",
      state: "CA",
      reason: "We are hiring baristas.",
    });
    expect(mockRevalidate).toHaveBeenCalledWith("/admin/employer-requests");
  });

  it("blocks employers and admins from filing an unnecessary request", async () => {
    for (const role of ["employer", "admin"] as const) {
      mockRequireUser.mockResolvedValue({ ...seeker(), id: `${role}-1`, role });

      const state = await submitEmployerAccessRequestForUser(validForm());
      expect(state.status).toBe("error");
      expect(state.message).toContain("이미");
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns validation errors without touching the database", async () => {
    const formData = validForm();
    formData.delete("businessName");

    const state = await submitEmployerAccessRequestForUser(formData);
    expect(state.status).toBe("error");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("maps duplicate-pending and unavailable results to clear messages", async () => {
    mockCreate.mockResolvedValue({ status: "duplicate_pending" });
    let state = await submitEmployerAccessRequestForUser(validForm());
    expect(state.status).toBe("duplicate_pending");
    expect(state.message).toContain("검토 대기 중인 요청");

    mockCreate.mockResolvedValue({ status: "unavailable" });
    state = await submitEmployerAccessRequestForUser(validForm());
    expect(state.status).toBe("error");
    expect(state.message).toContain("Supabase");
  });
});

describe("reviewEmployerRequest", () => {
  it("guards with the exact admin role and approves pending requests", async () => {
    mockReview.mockResolvedValue({ status: "ok", decision: "approved" });
    const formData = new FormData();
    formData.set("requestId", REQUEST_ID);
    formData.set("decision", "approved");

    const state = await reviewEmployerRequest(
      { status: "idle", message: "" },
      formData,
    );
    expect(mockRequireRole).toHaveBeenCalledWith("admin", "/admin/employer-requests");
    expect(mockReview).toHaveBeenCalledWith(REQUEST_ID, "approved");
    expect(state.status).toBe("success");
    expect(state.message).toContain("고용주 권한으로 전환");
    expect(mockRevalidate).toHaveBeenCalledWith("/admin/employer-requests");
  });

  it("rejects without touching the requester role message-wise", async () => {
    mockReview.mockResolvedValue({ status: "ok", decision: "rejected" });
    const formData = new FormData();
    formData.set("requestId", REQUEST_ID);
    formData.set("decision", "rejected");

    const state = await reviewEmployerRequest(
      { status: "idle", message: "" },
      formData,
    );
    expect(state.status).toBe("success");
    expect(state.message).toContain("권한은 변경되지 않았습니다");
  });

  it("refuses malformed ids and unknown decisions before any DB call", async () => {
    for (const [requestId, decision] of [
      ["not-a-uuid", "approved"],
      [REQUEST_ID, "promote"],
    ] as const) {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("decision", decision);

      const state = await reviewEmployerRequest(
        { status: "idle", message: "" },
        formData,
      );
      expect(state.status).toBe("error");
    }
    expect(mockReview).not.toHaveBeenCalled();
  });

  it("maps conflicts and unavailable results", async () => {
    mockReview.mockResolvedValue({ status: "conflict" });
    const formData = new FormData();
    formData.set("requestId", REQUEST_ID);
    formData.set("decision", "approved");

    let state = await reviewEmployerRequest({ status: "idle", message: "" }, formData);
    expect(state.status).toBe("conflict");

    mockReview.mockResolvedValue({ status: "unavailable" });
    state = await reviewEmployerRequest({ status: "idle", message: "" }, formData);
    expect(state.status).toBe("error");
    expect(state.message).toContain("Supabase");
  });
});
