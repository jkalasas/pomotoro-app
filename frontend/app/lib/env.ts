// Small helper for feature flags coming from Vite environment variables.
// Vite exposes env vars prefixed with VITE_ via import.meta.env.
// We treat the following values as truthy: "1", "true", "yes" (case-sensitive per Vite/raw .env strings).
export const SHOW_TEST_FEATURES =
  import.meta.env.VITE_SHOW_TEST_FEATURES === "1" ||
  import.meta.env.VITE_SHOW_TEST_FEATURES === "true" ||
  import.meta.env.VITE_SHOW_TEST_FEATURES === "yes";

export function showTestFeatures() {
  return SHOW_TEST_FEATURES;
}
