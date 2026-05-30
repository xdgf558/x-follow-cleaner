import {
  AccountStatus,
  DEFAULT_SETTINGS,
  DEFAULT_TASK_STATE,
  STORAGE_KEYS
} from "./constants.js";

function normalizeUsername(username) {
  return String(username || "").replace(/^@/, "").trim().toLowerCase();
}

function withChromeStorage() {
  if (!globalThis.chrome?.storage?.local) {
    throw new Error("chrome.storage.local is not available.");
  }

  return chrome.storage.local;
}

function storageGet(keys) {
  return withChromeStorage().get(keys);
}

function storageSet(items) {
  return withChromeStorage().set(items);
}

function createEmptyTaskState(message = "") {
  return {
    ...DEFAULT_TASK_STATE,
    lastUpdatedAt: new Date().toISOString(),
    message
  };
}

export async function getAccounts() {
  const result = await storageGet(STORAGE_KEYS.ACCOUNTS);
  return Array.isArray(result[STORAGE_KEYS.ACCOUNTS])
    ? result[STORAGE_KEYS.ACCOUNTS]
    : [];
}

export async function saveAccounts(accounts) {
  const cleanAccounts = Array.isArray(accounts) ? accounts : [];
  await storageSet({ [STORAGE_KEYS.ACCOUNTS]: cleanAccounts });
  await saveTaskState(buildTaskState(cleanAccounts, "账户数据已更新。"));
  return cleanAccounts;
}

export async function upsertAccounts(accounts) {
  const existing = await getAccounts();
  const byUsername = new Map();

  for (const account of existing) {
    const username = normalizeUsername(account.username);
    if (username) {
      byUsername.set(username, { ...account, username });
    }
  }

  for (const account of Array.isArray(accounts) ? accounts : []) {
    const username = normalizeUsername(account.username);
    if (!username) continue;

    const previous = byUsername.get(username) || {};
    byUsername.set(username, {
      ...previous,
      ...account,
      username,
      status: previous.status || account.status || AccountStatus.PENDING,
      processed: Boolean(previous.processed || account.processed),
      whitelisted: Boolean(previous.whitelisted || account.whitelisted),
      manualNote: previous.manualNote || account.manualNote || "",
      collectedAt: previous.collectedAt || account.collectedAt || new Date().toISOString()
    });
  }

  return saveAccounts(Array.from(byUsername.values()));
}

export async function updateAccount(username, patch) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;

  const accounts = await getAccounts();
  let updatedAccount = null;
  const nextAccounts = accounts.map((account) => {
    if (normalizeUsername(account.username) !== normalizedUsername) return account;

    updatedAccount = {
      ...account,
      ...patch,
      username: normalizedUsername
    };
    return updatedAccount;
  });

  if (!updatedAccount) {
    updatedAccount = {
      username: normalizedUsername,
      displayName: patch?.displayName || normalizedUsername,
      profileUrl: patch?.profileUrl || `https://x.com/${normalizedUsername}`,
      avatarUrl: patch?.avatarUrl || "",
      bio: patch?.bio || "",
      collectedAt: new Date().toISOString(),
      lastCheckedAt: "",
      lastPostAt: "",
      inactiveDays: null,
      inactiveConfirmationCount: 0,
      inactiveFirstSeenAt: "",
      inactiveLastConfirmedAt: "",
      lastSourceText: "",
      lastStatusUrl: "",
      status: AccountStatus.PENDING,
      errorMessage: "",
      processed: false,
      whitelisted: false,
      manualNote: "",
      ...patch
    };
    nextAccounts.push(updatedAccount);
  }

  await saveAccounts(nextAccounts);
  return updatedAccount;
}

export async function clearAccounts() {
  await storageSet({
    [STORAGE_KEYS.ACCOUNTS]: [],
    [STORAGE_KEYS.TASK_STATE]: createEmptyTaskState("本地账户数据已清空。")
  });
}

export async function getSettings() {
  const result = await storageGet(STORAGE_KEYS.SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEYS.SETTINGS] || {})
  };
}

export async function saveSettings(settings) {
  const minDelay = Number(settings?.experimentalMinDelaySeconds || DEFAULT_SETTINGS.experimentalMinDelaySeconds);
  const maxDelay = Number(settings?.experimentalMaxDelaySeconds || DEFAULT_SETTINGS.experimentalMaxDelaySeconds);
  const safeSettings = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    experimentalBatchSize: Math.min(20, Math.max(1, Number(settings?.experimentalBatchSize || DEFAULT_SETTINGS.experimentalBatchSize))),
    experimentalMinDelaySeconds: Math.max(15, minDelay),
    experimentalMaxDelaySeconds: Math.max(Math.max(15, minDelay), maxDelay),
    experimentalDailyLimit: 100
  };
  await storageSet({ [STORAGE_KEYS.SETTINGS]: safeSettings });
  return safeSettings;
}

export async function getBatchUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await storageGet(STORAGE_KEYS.BATCH_USAGE);
  const usage = result[STORAGE_KEYS.BATCH_USAGE] || {};

  if (usage.date !== today) {
    return {
      date: today,
      checkedCount: 0
    };
  }

  return {
    date: today,
    checkedCount: Number(usage.checkedCount || 0)
  };
}

export async function incrementBatchUsage(count = 1) {
  const usage = await getBatchUsage();
  const nextUsage = {
    ...usage,
    checkedCount: usage.checkedCount + count
  };
  await storageSet({ [STORAGE_KEYS.BATCH_USAGE]: nextUsage });
  return nextUsage;
}

export async function getTaskState() {
  const result = await storageGet(STORAGE_KEYS.TASK_STATE);
  return {
    ...DEFAULT_TASK_STATE,
    ...(result[STORAGE_KEYS.TASK_STATE] || {})
  };
}

export async function saveTaskState(taskState) {
  const safeTaskState = {
    ...DEFAULT_TASK_STATE,
    ...(taskState || {}),
    lastUpdatedAt: taskState?.lastUpdatedAt || new Date().toISOString()
  };
  await storageSet({ [STORAGE_KEYS.TASK_STATE]: safeTaskState });
  return safeTaskState;
}

export function buildTaskState(accounts, message = "") {
  const list = Array.isArray(accounts) ? accounts : [];
  return {
    ...DEFAULT_TASK_STATE,
    totalAccounts: list.length,
    pendingAccounts: list.filter((account) => account.status === AccountStatus.PENDING).length,
    inactiveAccounts: list.filter((account) => account.status === AccountStatus.INACTIVE).length,
    reviewAccounts: list.filter((account) => account.status === AccountStatus.REVIEW).length,
    unknownAccounts: list.filter((account) => account.status === AccountStatus.UNKNOWN || account.status === AccountStatus.ERROR).length,
    activeAccounts: list.filter((account) => account.status === AccountStatus.ACTIVE).length,
    lastUpdatedAt: new Date().toISOString(),
    message
  };
}

export function summarizeAccounts(accounts) {
  const list = Array.isArray(accounts) ? accounts : [];
  return {
    total: list.length,
    inactive: list.filter((account) => account.status === AccountStatus.INACTIVE).length,
    review: list.filter((account) => account.status === AccountStatus.REVIEW).length,
    active: list.filter((account) => account.status === AccountStatus.ACTIVE).length,
    unknown: list.filter((account) => account.status === AccountStatus.UNKNOWN || account.status === AccountStatus.ERROR).length,
    whitelisted: list.filter((account) => account.whitelisted).length,
    processed: list.filter((account) => account.processed).length
  };
}
