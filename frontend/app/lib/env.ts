// Small helper for feature flags coming from Vite environment variables.
// Vite exposes env vars prefixed with VITE_ via import.meta.env.
// We treat the following values as truthy: "1", "true", "yes" (case-sensitive per Vite/raw .env strings).
export const SHOW_TEST_FEATURES =
  import.meta.env.VITE_SHOW_TEST_FEATURES === "1" ||
  import.meta.env.VITE_SHOW_TEST_FEATURES === "true" ||
  import.meta.env.VITE_SHOW_TEST_FEATURES === "yes";

export const SHOW_OVERLAY =
  import.meta.env.VITE_SHOW_OVERLAY !== "false" &&
  import.meta.env.VITE_SHOW_OVERLAY !== "0" &&
  import.meta.env.VITE_SHOW_OVERLAY !== "no" &&
  (import.meta.env.VITE_SHOW_OVERLAY === "1" ||
   import.meta.env.VITE_SHOW_OVERLAY === "true" ||
   import.meta.env.VITE_SHOW_OVERLAY === "yes" ||
   import.meta.env.VITE_SHOW_OVERLAY === undefined ||
   import.meta.env.VITE_SHOW_OVERLAY === "");

export function showTestFeatures() {
  return SHOW_TEST_FEATURES;
}

export function showOverlay() {
  return SHOW_OVERLAY;
}
