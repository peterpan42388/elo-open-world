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

export function classifyExternalLinks(links = []) {
  const normalizedLinks = Array.isArray(links)
    ? links
        .map((link) => ({
          label: String(link?.label || "").trim(),
          href: sanitizeExternalHref(link?.href),
          missingMessage: String(link?.missingMessage || "").trim()
        }))
        .filter((link) => link.label)
    : [];

  return {
    availableLinks: normalizedLinks.filter((link) => link.href),
    missingLinks: normalizedLinks.filter((link) => !link.href)
  };
}
