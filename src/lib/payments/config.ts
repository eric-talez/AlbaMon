import type { BoostType } from "@/lib/types";

const PLACEHOLDER_FRAGMENTS = [
  "xxx",
  "your-",
  "example",
  "placeholder",
];

function configured(value: string | undefined): value is string {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_FRAGMENTS.some((fragment) =>
    trimmed.toLowerCase().includes(fragment),
  );
}

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : "http://localhost:3000";
}

export function getStripeSecretKey(): string | null {
  return configured(process.env.STRIPE_SECRET_KEY)
    ? process.env.STRIPE_SECRET_KEY.trim()
    : null;
}

export function getStripeWebhookSecret(): string | null {
  return configured(process.env.STRIPE_WEBHOOK_SECRET)
    ? process.env.STRIPE_WEBHOOK_SECRET.trim()
    : null;
}

export function getStripePriceId(boostType: BoostType): string | null {
  const value =
    boostType === "featured"
      ? process.env.STRIPE_FEATURED_PRICE_ID
      : process.env.STRIPE_URGENT_PRICE_ID;
  return configured(value) ? value.trim() : null;
}

export function isStripeCheckoutConfigured(boostType: BoostType): boolean {
  return Boolean(getStripeSecretKey() && getStripePriceId(boostType));
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(getStripeWebhookSecret());
}
