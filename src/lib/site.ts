/**
 * Central site/brand configuration.
 *
 * Naming note: the product is "K-Work US". We deliberately avoid any existing
 * Korean job-board brand name or confusingly similar wording (trademark /
 * brand-confusion risk). Positioning is Korean-English bilingual local jobs —
 * NOT Korean-only hiring.
 */
export const SITE_NAME = "K-Work US";
export const SITE_TAGLINE = "한인 커뮤니티 로컬 채용";
export const SITE_DESCRIPTION =
  "미국 한인 커뮤니티를 위한 Korean-English bilingual 로컬 구인구직 플랫폼.";

/**
 * Absolute site origin for URL-based metadata (canonical, Open Graph, sitemap,
 * robots). Set `NEXT_PUBLIC_SITE_URL` per environment; unset or malformed
 * values fall back to localhost so builds never depend on deploy config.
 */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

/** Initial launch market. */
export const LAUNCH_MARKET = "LA / Orange County";

/** Cities we seed/launch with first (LA Koreatown + OC Korean hubs). */
export const LAUNCH_CITIES = [
  "Los Angeles (Koreatown)",
  "Buena Park",
  "Fullerton",
  "Irvine",
  "Garden Grove",
  "Torrance",
  "Gardena",
  "West Covina",
  "Rowland Heights",
] as const;
