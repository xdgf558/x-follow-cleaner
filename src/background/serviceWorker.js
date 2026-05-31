import {
  getAccounts,
  getBatchState,
  getBatchUsage,
  getSettings,
  getTaskState,
  incrementBatchUsage,
  saveBatchState,
  saveSettings,
  saveTaskState,
  updateAccount
} from "../shared/storage.js";
import { AccountStatus, BatchMode, BatchStatus } from "../shared/constants.js";
import { formatMessage, getText } from "../shared/i18n.js";
import { buildProfileActivityPatch, getEffectiveAccount } from "../shared/statusUtils.js";

const BATCH_ALARM_NAME = "xFollowCleaner.batch.next";
const MIN_INTER_ACCOUNT_DELAY_MS = 15 * 1000;

function normalizeUsername(username) {
  return String(username || "").replace(/^@/, "").trim().toLowerCase();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelaySeconds(min, max) {
  const safeMin = Math.max(15, Number(min || 15));
  const safeMax = Math.max(safeMin, Number(max || 30));
  return Math.floor(safeMin + Math.random() * (safeMax - safeMin + 1));
}

function tabMatchesUsername(tab, username) {
  const expectedUsername = normalizeUsername(username);
  if (!expectedUsername) return true;

  try {
    const tabUrl = new URL(tab?.url || "");
    const pathUsername = normalizeUsername(decodeURIComponent(tabUrl.pathname.split("/").filter(Boolean)[0] || ""));
    return pathUsername === expectedUsername;
  } catch {
    return false;
  }
}

async function waitForTabComplete(tabId, username, text, timeoutMs = 30000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.status === "complete" && tabMatchesUsername(tab, username)) return;

  await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(text.profileLoadTimeout));
    }, timeoutMs);

    function cleanup() {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onRemoved.removeListener(handleRemoved);
    }

    async function handleUpdated(updatedTabId, changeInfo) {
      if (settled || updatedTabId !== tabId) return;
      if (changeInfo.status !== "complete" && !changeInfo.url) return;

      const currentTab = await chrome.tabs.get(tabId).catch(() => null);
      if (currentTab?.status === "complete" && tabMatchesUsername(currentTab, username)) {
        cleanup();
        resolve();
      }
    }

    function handleRemoved(removedTabId) {
      if (removedTabId === tabId) {
        cleanup();
        reject(new Error(text.batchTabClosed));
      }
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleRemoved);
  });
}

async function scheduleBatchAlarm(delayMs) {
  await chrome.alarms.clear(BATCH_ALARM_NAME);
  await chrome.alarms.create(BATCH_ALARM_NAME, {
    when: Date.now() + Math.max(1000, delayMs)
  });
}

async function stopBatchAlarm() {
  await chrome.alarms.clear(BATCH_ALARM_NAME);
}

function getCandidateAccounts(mode, accounts, settings, username = "") {
  const normalizedUsername = normalizeUsername(username);
  const effectiveAccounts = accounts.map((account) => getEffectiveAccount(account, settings));

  if (mode === BatchMode.SINGLE) {
    return effectiveAccounts.filter((account) => normalizeUsername(account.username) === normalizedUsername);
  }

  if (mode === BatchMode.INACTIVE_RECHECK) {
    return effectiveAccounts.filter((account) => {
      if (account.whitelisted || account.processed) return false;
      return account.status === AccountStatus.REVIEW || account.status === AccountStatus.INACTIVE;
    });
  }

  if (mode === BatchMode.UNKNOWN_RECHECK) {
    return effectiveAccounts.filter((account) => {
      if (account.whitelisted || account.processed) return false;
      return account.status === AccountStatus.UNKNOWN || account.status === AccountStatus.ERROR;
    });
  }

  return effectiveAccounts.filter((account) => {
    if (account.whitelisted || account.processed) return false;
    if (account.status === AccountStatus.ACTIVE || account.status === AccountStatus.INACTIVE || account.status === AccountStatus.REVIEW) {
      return false;
    }
    return Boolean(account.username);
  });
}

function getProgressTemplate(mode, text) {
  return mode === BatchMode.PENDING ? text.checkingAccount : text.recheckingAccount;
}

function getDoneTemplate(mode, text) {
  return mode === BatchMode.PENDING ? text.batchDone : text.recheckDone;
}

function getAccountByUsername(accounts, username) {
  const normalizedUsername = normalizeUsername(username);
  return accounts.find((account) => normalizeUsername(account.username) === normalizedUsername) || {
    username: normalizedUsername,
    profileUrl: `https://x.com/${normalizedUsername}`
  };
}

async function openProfileForBatch(batchState, account) {
  const username = normalizeUsername(account.username);
  const url = account.profileUrl || `https://x.com/${username}`;

  if (batchState.tabId) {
    const existingTab = await chrome.tabs.get(batchState.tabId).catch(() => null);
    if (existingTab) {
      await chrome.tabs.update(batchState.tabId, { url, active: true });
      return batchState.tabId;
    }
  }

  const tab = await chrome.tabs.create({ url, active: true });
  return tab.id;
}

async function injectProfileParser(tabId, expectedUsername = "") {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content/profileActivityParser.js"]
  });

  const [injectionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (username) => {
      return window.XFollowCleanerProfileParser?.scanProfileActivity?.(username) || {
        ok: false,
        code: "parser_missing",
        message: "主页读取脚本未能加载，请刷新页面后再试。"
      };
    },
    args: [expectedUsername]
  });

  return injectionResult?.result;
}

function isProfileLoadingResult(result) {
  return result?.code === "profile_loading";
}

async function readStableProfileActivity(tabId, username, text, timeoutMs = 18000) {
  const startedAt = Date.now();
  let lastResult = null;

  while (Date.now() - startedAt <= timeoutMs) {
    const batchState = await getBatchState();
    if (batchState.status !== BatchStatus.RUNNING) {
      throw new Error(text.paused);
    }

    const result = await injectProfileParser(tabId, username).catch((error) => ({
      ok: false,
      code: "page_error",
      username,
      message: error.message
    }));

    if (!isProfileLoadingResult(result)) {
      return result;
    }

    lastResult = result;
    await delay(1500);
  }

  return {
    ok: true,
    code: "unknown",
    username,
    lastPostAt: "",
    inactiveDays: null,
    message: lastResult?.message || text.noEvidence
  };
}

async function saveProfileResult(account, result, settings) {
  const patch = buildProfileActivityPatch(account, result, settings, new Date().toISOString());
  await updateAccount(account.username, patch);
  return patch;
}

function shouldStopForSafety(result) {
  return result?.code === "verification" || result?.code === "rate_limited";
}

async function startBatch(mode = BatchMode.PENDING, username = "") {
  const settings = await getSettings();
  const text = getText(settings);
  const currentState = await getBatchState();

  if (currentState.status === BatchStatus.RUNNING) {
    return currentState;
  }

  if (mode !== BatchMode.SINGLE && !settings.enableExperimentalBatchCheck) {
    return saveBatchState({
      status: BatchStatus.IDLE,
      message: text.batchNotEnabled
    });
  }

  const usage = await getBatchUsage();
  const remainingToday = Math.max(0, Number(settings.experimentalDailyLimit || 100) - usage.checkedCount);
  if (remainingToday <= 0) {
    return saveBatchState({
      status: BatchStatus.IDLE,
      message: text.dailyLimit
    });
  }

  const accounts = await getAccounts();
  const limit = mode === BatchMode.SINGLE
    ? 1
    : Math.min(Number(settings.experimentalBatchSize || 20), 20, remainingToday);
  const candidates = getCandidateAccounts(mode, accounts, settings, username).slice(0, limit);

  if (candidates.length === 0) {
    return saveBatchState({
      status: BatchStatus.IDLE,
      mode,
      message: text.noCandidates
    });
  }

  const now = new Date().toISOString();
  const batchState = await saveBatchState({
    status: BatchStatus.RUNNING,
    mode,
    queue: candidates.map((account) => normalizeUsername(account.username)),
    currentIndex: 0,
    checkedCount: 0,
    tabId: currentState.tabId || null,
    currentUsername: "",
    nextRunAt: new Date(Date.now() + 1000).toISOString(),
    startedAt: now,
    completedAt: "",
    message: text.preparingBatch,
    errorMessage: ""
  });

  await scheduleBatchAlarm(1000);
  return batchState;
}

async function pauseBatch() {
  await stopBatchAlarm();
  const currentState = await getBatchState();
  return saveBatchState({
    ...currentState,
    status: BatchStatus.PAUSED,
    nextRunAt: "",
    message: getText(await getSettings()).paused
  });
}

async function finishBatch(batchState, status, message, errorMessage = "") {
  await stopBatchAlarm();
  return saveBatchState({
    ...batchState,
    status,
    nextRunAt: "",
    completedAt: new Date().toISOString(),
    message,
    errorMessage
  });
}

async function advanceBatchAfterDelay(batchState, settings, text, account) {
  const delaySeconds = randomDelaySeconds(
    settings.experimentalMinDelaySeconds,
    settings.experimentalMaxDelaySeconds
  );
  const safeDelayMs = Math.max(MIN_INTER_ACCOUNT_DELAY_MS, delaySeconds * 1000);
  const nextRunAt = new Date(Date.now() + safeDelayMs).toISOString();
  const nextState = await saveBatchState({
    ...batchState,
    currentIndex: batchState.currentIndex + 1,
    checkedCount: batchState.checkedCount + 1,
    currentUsername: "",
    nextRunAt,
    message: formatMessage(text.checkedWaiting, {
      username: account.username,
      seconds: Math.ceil(safeDelayMs / 1000)
    })
  });

  await scheduleBatchAlarm(safeDelayMs);
  return nextState;
}

async function processNextBatchAccount() {
  let batchState = await getBatchState();
  if (batchState.status !== BatchStatus.RUNNING) return batchState;

  const settings = await getSettings();
  const text = getText(settings);
  const queue = Array.isArray(batchState.queue) ? batchState.queue : [];

  if (batchState.currentIndex >= queue.length) {
    return finishBatch(
      batchState,
      BatchStatus.COMPLETED,
      formatMessage(getDoneTemplate(batchState.mode, text), { count: batchState.checkedCount })
    );
  }

  const usage = await getBatchUsage();
  const remainingToday = Math.max(0, Number(settings.experimentalDailyLimit || 100) - usage.checkedCount);
  if (remainingToday <= 0) {
    return finishBatch(batchState, BatchStatus.PAUSED, text.dailyLimit);
  }

  const accounts = await getAccounts();
  const username = queue[batchState.currentIndex];
  const account = getAccountByUsername(accounts, username);

  batchState = await saveBatchState({
    ...batchState,
    currentUsername: username,
    message: formatMessage(getProgressTemplate(batchState.mode, text), {
      index: batchState.currentIndex + 1,
      total: queue.length,
      username
    })
  });

  try {
    const tabId = await openProfileForBatch(batchState, account);
    batchState = await saveBatchState({
      ...batchState,
      tabId
    });

    await waitForTabComplete(tabId, username, text);
    await delay(2500);
    const result = await readStableProfileActivity(tabId, username, text);
    await saveProfileResult(account, result, settings);
    await incrementBatchUsage(1);

    if (shouldStopForSafety(result)) {
      return finishBatch(
        batchState,
        BatchStatus.ERROR,
        formatMessage(text.safetyStopped, {
          reason: result.code === "verification" ? text.verification : text.rateLimited
        }),
        result.message || ""
      );
    }

    const nextIndex = batchState.currentIndex + 1;
    const nextCheckedCount = batchState.checkedCount + 1;
    if (nextIndex >= queue.length) {
      return finishBatch(
        {
          ...batchState,
          currentIndex: nextIndex,
          checkedCount: nextCheckedCount,
          currentUsername: ""
        },
        BatchStatus.COMPLETED,
        formatMessage(getDoneTemplate(batchState.mode, text), { count: nextCheckedCount })
      );
    }

    return advanceBatchAfterDelay(batchState, settings, text, account);
  } catch (error) {
    return finishBatch(
      batchState,
      BatchStatus.ERROR,
      formatMessage(text.batchStopped, { message: error.message }),
      error.message
    );
  }
}

async function resumeBatchIfNeeded() {
  const batchState = await getBatchState();
  if (batchState.status !== BatchStatus.RUNNING) return;

  const nextRunAt = Date.parse(batchState.nextRunAt || "");
  const delayMs = Number.isFinite(nextRunAt) ? Math.max(1000, nextRunAt - Date.now()) : 1000;
  await scheduleBatchAlarm(delayMs);
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await saveSettings(settings);

  const taskState = await getTaskState();
  if (!taskState.lastUpdatedAt) {
    await saveTaskState({
      currentStage: "idle",
      lastAction: "installed",
      message: "插件已安装，等待用户手动操作。"
    });
  }

  await resumeBatchIfNeeded();
});

chrome.runtime.onStartup.addListener(() => {
  resumeBatchIfNeeded().catch((error) => {
    console.error("Failed to resume batch check", error);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== BATCH_ALARM_NAME) return;
  processNextBatchAccount().catch(async (error) => {
    const currentState = await getBatchState();
    await finishBatch(currentState, BatchStatus.ERROR, error.message, error.message);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  getBatchState()
    .then(async (batchState) => {
      if (batchState.status !== BatchStatus.RUNNING || batchState.tabId !== tabId) return;
      const text = getText(await getSettings());
      await finishBatch(batchState, BatchStatus.PAUSED, text.batchTabClosed);
    })
    .catch((error) => {
      console.error("Failed to stop batch after tab close", error);
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  if (message.type === "xFollowCleaner.batch.start") {
    startBatch(message.mode || BatchMode.PENDING, message.username)
      .then((batchState) => sendResponse({ ok: true, batchState }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "xFollowCleaner.batch.pause") {
    pauseBatch()
      .then((batchState) => sendResponse({ ok: true, batchState }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  if (message.type === "xFollowCleaner.batch.status") {
    getBatchState()
      .then((batchState) => sendResponse({ ok: true, batchState }))
      .catch((error) => sendResponse({ ok: false, message: error.message }));
    return true;
  }

  return false;
});
