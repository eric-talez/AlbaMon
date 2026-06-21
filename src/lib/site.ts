/**
 * Central site/brand configuration.
 *
 * Naming note: the product is "K-Work US". We deliberately avoid "AlbaMon"
 * or any confusingly similar brand name (trademark / brand-confusion risk).
 * Positioning is Korean-English bilingual local jobs — NOT Korean-only hiring.
 */
export const SITE_NAME = "K-Work US";
export const SITE_TAGLINE = "한인 커뮤니티 로컬 채용";
export const SITE_DESCRIPTION =
  "미국 한인 커뮤니티를 위한 Korean-English bilingual 로컬 구인구직 플랫폼.";

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
