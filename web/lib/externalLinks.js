export function sanitizeExternalHref(value) {
  const normalized = String(value || "").trim();
  if (!normalized || !/^https?:\/\//i.test(normalized)) return "";
  try {
    const url = new URL(normalized);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
