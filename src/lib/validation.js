import crypto from "node:crypto";

export function token(name, value, maxLen = 128) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const v = value.trim();
  if (!v) throw new Error(`${name} is required`);
  if (v.length > maxLen) throw new Error(`${name} too long`);
  if (!/^[A-Za-z0-9._:/@-]+$/.test(v)) throw new Error(`${name} contains invalid characters`);
  return v;
}

export function slug(name, value, maxLen = 128) {
  const v = token(name, value, maxLen).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(v)) throw new Error(`${name} must be a lowercase slug`);
  return v;
}

export function text(name, value, maxLen = 512) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const v = value.trim();
  if (v.length > maxLen) throw new Error(`${name} too long`);
  return v;
}

export function email(name, value, maxLen = 320) {
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  const v = value.trim().toLowerCase();
  if (!v) throw new Error(`${name} is required`);
  if (v.length > maxLen) throw new Error(`${name} too long`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error(`${name} must be a valid email`);
  return v;
}

export function asArray(values, itemName, maxLen = 128) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => token(itemName, String(value), maxLen));
}

export function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "online"].includes(normalized)) return true;
    if (["false", "0", "no", "offline"].includes(normalized)) return false;
  }
  throw new Error("boolean value expected");
}

export function now() {
  return Date.now();
}

export function round(n) {
  return Math.round(Number(n) * 1_000_000) / 1_000_000;
}

export function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
