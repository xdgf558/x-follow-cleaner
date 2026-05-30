import { RESERVED_X_PATHS, X_HOSTS } from "./constants.js";

export function getSafeUrl(rawUrl) {
  try {
    return new URL(rawUrl || "");
  } catch {
    return null;
  }
}

export function normalizeXHost(hostname) {
  return String(hostname || "").replace(/^www\./, "").toLowerCase();
}

export function isXUrl(rawUrl) {
  const url = getSafeUrl(rawUrl);
  return Boolean(url && X_HOSTS.has(normalizeXHost(url.hostname)));
}

export function getProfileUsernameFromUrl(rawUrl) {
  const url = getSafeUrl(rawUrl);
  if (!url || !isXUrl(rawUrl)) return "";

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return "";

  const username = decodeURIComponent(parts[0] || "").replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/i.test(username)) return "";
  if (RESERVED_X_PATHS.has(username)) return "";

  return username;
}

export function isFollowingUrl(rawUrl) {
  const url = getSafeUrl(rawUrl);
  if (!url || !isXUrl(rawUrl)) return false;

  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length === 2 && parts[1].toLowerCase() === "following";
}

export function isProfileUrl(rawUrl) {
  return Boolean(getProfileUsernameFromUrl(rawUrl));
}
