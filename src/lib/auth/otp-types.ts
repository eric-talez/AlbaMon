/**
 * Result types for the server-boundary phone OTP actions (Slice 28).
 *
 * Pure — no `server-only` import — so both the `"use server"` action module and
 * the client form can share them. Discriminated on `status`; the `rate_limited`
 * branch reuses the shared `RateLimitedResult` shape.
 */
import type { RateLimitedResult } from "@/lib/rate-limit/types";

export type RequestOtpResult =
  | { status: "ok" }
  | { status: "error"; message: string }
  | RateLimitedResult;

export type VerifyOtpResult =
  | { status: "ok"; next: string }
  | { status: "error"; message: string }
  | RateLimitedResult;
