import { afterEach, describe, expect, it, vi } from "vitest";
import {
  notifyApplicationStatusChanged,
  notifyApplicationSubmitted,
  notifyNewMessage,
} from "@/lib/notifications/dev";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("development notification stubs", () => {
  it("logs non-PII application, status, and message events outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(notifyApplicationSubmitted("application-1")).toBe("logged");
    expect(notifyApplicationStatusChanged("application-1", "submitted", "reviewing")).toBe("logged");
    expect(notifyNewMessage("application-1", "message-1", "seeker")).toBe("logged");
    expect(notifyNewMessage("application-1", "message-2", "employer")).toBe("logged");
    const output = info.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("application_submitted");
    expect(output).toContain("application_status_changed");
    expect(output).toContain("new_message");
    expect(output).toContain('"audience":"employer"');
    expect(output).toContain('"audience":"seeker"');
    expect(output).not.toMatch(/@|phone|address|cover_note/i);
  });

  it("does nothing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    expect(notifyApplicationSubmitted("application-1")).toBe("skipped");
    expect(info).not.toHaveBeenCalled();
  });
});
