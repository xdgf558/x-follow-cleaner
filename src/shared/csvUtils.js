export const CSV_FIELDS = [
  "username",
  "displayName",
  "profileUrl",
  "lastPostAt",
  "inactiveDays",
  "inactiveConfirmationCount",
  "status",
  "mutualFollowStatus",
  "followsYouLastCheckedAt",
  "followsYouSourceText",
  "suspectedUnfollow",
  "suspectedUnfollowAt",
  "lastSourceText",
  "lastStatusUrl",
  "processed",
  "whitelisted",
  "collectedAt",
  "lastCheckedAt",
  "manualNote"
];

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function accountsToCsv(accounts) {
  const rows = [CSV_FIELDS.join(",")];

  for (const account of Array.isArray(accounts) ? accounts : []) {
    rows.push(CSV_FIELDS.map((field) => csvEscape(account[field])).join(","));
  }

  return rows.join("\n");
}

export function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createExportFilename(extension) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `x-follow-cleaner-${stamp}.${extension}`;
}
