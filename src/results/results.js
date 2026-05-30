import { getAccounts, getBatchUsage, getSettings, incrementBatchUsage, summarizeAccounts, updateAccount } from "../shared/storage.js";
import { accountsToCsv, createExportFilename, downloadTextFile } from "../shared/csvUtils.js";
import { AccountStatus } from "../shared/constants.js";
import { applyTranslations, formatMessage, getText } from "../shared/i18n.js";
import {
  accountMatchesFilter,
  buildProfileActivityPatch,
  getEffectiveAccount,
  getDisplayStatus,
  getStatusClass,
  getStatusLabel
} from "../shared/statusUtils.js";

const state = {
  accounts: [],
  settings: {},
  filter: "all",
  search: "",
  batch: {
    running: false,
    stopRequested: false,
    tabId: null,
    message: ""
  }
};

const elements = {
  summaryTotal: document.querySelector("#summaryTotal"),
  summaryInactive: document.querySelector("#summaryInactive"),
  summaryReview: document.querySelector("#summaryReview"),
  summaryActive: document.querySelector("#summaryActive"),
  summaryUnknown: document.querySelector("#summaryUnknown"),
  summaryWhitelisted: document.querySelector("#summaryWhitelisted"),
  summaryProcessed: document.querySelector("#summaryProcessed"),
  searchInput: document.querySelector("#searchInput"),
  refreshResults: document.querySelector("#refreshResults"),
  exportCsv: document.querySelector("#exportCsv"),
  exportJson: document.querySelector("#exportJson"),
  batchStatus: document.querySelector("#batchStatus"),
  startBatchCheck: document.querySelector("#startBatchCheck"),
  recheckInactive: document.querySelector("#recheckInactive"),
  recheckUnknown: document.querySelector("#recheckUnknown"),
  pauseBatchCheck: document.querySelector("#pauseBatchCheck"),
  accountList: document.querySelector("#accountList"),
  rowTemplate: document.querySelector("#accountRowTemplate")
};

let currentText = getText("zh");

function normalizeSearch(value) {
  return String(value || "").replace(/^@/, "").trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return currentText.unchecked;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return currentText.unchecked;

  return new Intl.DateTimeFormat(state.settings.appLanguage === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return currentText.unchecked;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return currentText.unchecked;

  return new Intl.DateTimeFormat(state.settings.appLanguage === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatInactiveDays(value) {
  return Number.isFinite(value)
    ? formatMessage(currentText.dayCount, { days: value })
    : currentText.unknownDays;
}

function formatConfirmation(account) {
  if (account.status !== AccountStatus.REVIEW && account.status !== AccountStatus.INACTIVE) {
    return currentText.confirmationNotNeeded;
  }

  const count = Math.min(2, Math.max(0, Number(account.inactiveConfirmationCount || 0)));
  return formatMessage(currentText.confirmationProgress, { count });
}

function updateSummary() {
  const summary = summarizeAccounts(state.accounts.map((account) => getEffectiveAccount(account, state.settings)));
  elements.summaryTotal.textContent = String(summary.total);
  elements.summaryInactive.textContent = String(summary.inactive);
  elements.summaryReview.textContent = String(summary.review);
  elements.summaryActive.textContent = String(summary.active);
  elements.summaryUnknown.textContent = String(summary.unknown);
  elements.summaryWhitelisted.textContent = String(summary.whitelisted);
  elements.summaryProcessed.textContent = String(summary.processed);
}

function getFilteredAccounts() {
  const search = normalizeSearch(state.search);

  return state.accounts
    .map((account) => getEffectiveAccount(account, state.settings))
    .filter((account) => {
      if (state.filter !== "whitelisted" && state.settings.hideWhitelisted && account.whitelisted) {
        return false;
      }

      if (!state.settings.showUnknown && accountMatchesFilter(account, "unknown", state.settings)) {
        return false;
      }

      return accountMatchesFilter(account, state.filter, state.settings);
    })
    .filter((account) => {
      if (!search) return true;
      return normalizeSearch(account.username).includes(search);
    })
    .sort((a, b) => {
      if (state.settings.defaultSort === "lastCheckedAtDesc") {
        return new Date(b.lastCheckedAt || 0).getTime() - new Date(a.lastCheckedAt || 0).getTime();
      }

      const inactiveDiff = (b.inactiveDays ?? -1) - (a.inactiveDays ?? -1);
      return inactiveDiff || normalizeSearch(a.username).localeCompare(normalizeSearch(b.username));
    });
}

function createAvatar(account) {
  if (account.avatarUrl) {
    const image = document.createElement("img");
    image.className = "avatar";
    image.alt = account.displayName || account.username || "avatar";
    image.src = account.avatarUrl;
    image.referrerPolicy = "no-referrer";
    return image;
  }

  const fallback = document.createElement("div");
  fallback.className = "avatar-fallback";
  fallback.textContent = String(account.displayName || account.username || "?").trim().charAt(0).toUpperCase();
  return fallback;
}

function renderAccount(account) {
  const fragment = elements.rowTemplate.content.cloneNode(true);
  applyTranslations(fragment, currentText, state.settings.appLanguage);
  const row = fragment.querySelector(".account-row");
  const avatarWrap = fragment.querySelector(".avatar-wrap");
  const displayName = fragment.querySelector(".display-name");
  const username = fragment.querySelector(".username");
  const statusBadge = fragment.querySelector(".status-badge");
  const lastPost = fragment.querySelector(".last-post");
  const inactiveDays = fragment.querySelector(".inactive-days");
  const confirmationCount = fragment.querySelector(".confirmation-count");
  const checkedAt = fragment.querySelector(".checked-at");
  const sourceText = fragment.querySelector(".source-text");
  const evidenceLink = fragment.querySelector(".evidence-link");
  const recheckButton = fragment.querySelector('[data-action="recheck"]');
  const processedButton = fragment.querySelector('[data-action="processed"]');
  const whitelistButton = fragment.querySelector('[data-action="whitelist"]');

  const displayStatus = getDisplayStatus(account, state.settings);

  row.dataset.username = account.username;
  avatarWrap.append(createAvatar(account));
  displayName.textContent = account.displayName || account.username;
  username.textContent = `@${account.username}`;
  statusBadge.textContent = getStatusLabel(displayStatus, state.settings.appLanguage);
  statusBadge.className = `status-badge ${getStatusClass(displayStatus)}`;
  lastPost.textContent = formatDate(account.lastPostAt);
  inactiveDays.textContent = formatInactiveDays(account.inactiveDays);
  confirmationCount.textContent = formatConfirmation(account);
  checkedAt.textContent = formatDateTime(account.lastCheckedAt);
  sourceText.textContent = account.lastSourceText || currentText.noEvidence;
  if (account.lastStatusUrl) {
    const link = document.createElement("a");
    link.href = account.lastStatusUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = currentText.openEvidence;
    evidenceLink.append(link);
  } else {
    evidenceLink.textContent = currentText.noEvidence;
  }
  recheckButton.disabled = state.batch.running;
  processedButton.textContent = account.processed ? currentText.unmarkProcessed : currentText.markProcessed;
  whitelistButton.textContent = account.whitelisted ? currentText.removeWhitelist : currentText.addWhitelist;

  return fragment;
}

function renderAccounts() {
  updateSummary();
  renderBatchPanel();
  elements.accountList.replaceChildren();

  const accounts = getFilteredAccounts();
  if (accounts.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = state.accounts.length === 0
      ? currentText.noAccounts
      : currentText.noMatches;
    elements.accountList.append(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const account of accounts) {
    fragment.append(renderAccount(account));
  }
  elements.accountList.append(fragment);
}

function getBatchCandidates() {
  return state.accounts
    .map((account) => getEffectiveAccount(account, state.settings))
    .filter((account) => {
      if (account.whitelisted || account.processed) return false;
      if (account.status === AccountStatus.ACTIVE || account.status === AccountStatus.INACTIVE || account.status === AccountStatus.REVIEW) {
        return false;
      }
      return Boolean(account.username);
    });
}

function getInactiveReviewCandidates() {
  return state.accounts
    .map((account) => getEffectiveAccount(account, state.settings))
    .filter((account) => {
      if (account.whitelisted || account.processed) return false;
      return account.status === AccountStatus.REVIEW || account.status === AccountStatus.INACTIVE;
    });
}

function getUnknownCandidates() {
  return state.accounts
    .map((account) => getEffectiveAccount(account, state.settings))
    .filter((account) => {
      if (account.whitelisted || account.processed) return false;
      return account.status === AccountStatus.UNKNOWN || account.status === AccountStatus.ERROR;
    });
}

function renderBatchPanel(message = null) {
  if (message !== null) {
    state.batch.message = message;
  }

  const enabled = Boolean(state.settings.enableExperimentalBatchCheck);

  elements.startBatchCheck.disabled = state.batch.running || !enabled;
  elements.recheckInactive.disabled = state.batch.running || !enabled;
  elements.recheckUnknown.disabled = state.batch.running || !enabled;
  elements.pauseBatchCheck.disabled = !state.batch.running;

  if (state.batch.message) {
    elements.batchStatus.textContent = state.batch.message;
    return;
  }

  if (!enabled) {
    elements.batchStatus.textContent = currentText.batchDefaultOff;
    return;
  }

  const candidates = getBatchCandidates();
  const reviewCandidates = getInactiveReviewCandidates();
  const unknownCandidates = getUnknownCandidates();
  const batchSize = Math.min(Number(state.settings.experimentalBatchSize || 20), 20);
  elements.batchStatus.textContent = formatMessage(currentText.batchEnabled, {
    batchSize,
    min: state.settings.experimentalMinDelaySeconds,
    max: state.settings.experimentalMaxDelaySeconds,
    pending: candidates.length,
    review: reviewCandidates.length,
    unknown: unknownCandidates.length
  });
}

async function loadAccounts() {
  const [accounts, settings] = await Promise.all([getAccounts(), getSettings()]);
  state.accounts = accounts;
  state.settings = settings;
  currentText = getText(settings);
  applyTranslations(document, currentText, settings.appLanguage);
  renderAccounts();
}

function setActiveFilter(filter) {
  state.filter = filter;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
  });
  renderAccounts();
}

function getExportAccounts() {
  return state.accounts.map((account) => getEffectiveAccount(account, state.settings));
}

function exportCsv() {
  const csv = accountsToCsv(getExportAccounts());
  downloadTextFile(createExportFilename("csv"), csv, "text/csv;charset=utf-8");
}

function exportJson() {
  const payload = {
    exportedAt: new Date().toISOString(),
    accounts: state.accounts,
    settings: state.settings
  };

  downloadTextFile(
    createExportFilename("json"),
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function randomDelaySeconds(min, max) {
  const safeMin = Math.max(15, Number(min || 15));
  const safeMax = Math.max(safeMin, Number(max || 30));
  return Math.floor(safeMin + Math.random() * (safeMax - safeMin + 1));
}

function tabMatchesUsername(tab, username) {
  const expectedUsername = normalizeSearch(username);
  if (!expectedUsername) return true;

  try {
    const tabUrl = new URL(tab?.url || "");
    const pathUsername = normalizeSearch(decodeURIComponent(tabUrl.pathname.split("/").filter(Boolean)[0] || ""));
    return pathUsername === expectedUsername;
  } catch {
    return false;
  }
}

async function waitForTabComplete(tabId, username, timeoutMs = 30000) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.status === "complete" && tabMatchesUsername(tab, username)) return;

  await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("主页加载超时，请稍后重试。"));
    }, timeoutMs);

    function cleanup() {
      settled = true;
      window.clearTimeout(timeoutId);
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
        reject(new Error("检查标签页已关闭，低频检查已停止。"));
      }
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onRemoved.addListener(handleRemoved);
  });
}

async function openProfileForBatch(account) {
  const url = account.profileUrl || `https://x.com/${account.username}`;

  if (state.batch.tabId) {
    const existingTab = await chrome.tabs.get(state.batch.tabId).catch(() => null);
    if (existingTab) {
      await chrome.tabs.update(state.batch.tabId, { url, active: true });
      return state.batch.tabId;
    }
  }

  const tab = await chrome.tabs.create({ url, active: true });
  state.batch.tabId = tab.id;
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

async function readStableProfileActivity(tabId, username, timeoutMs = 18000) {
  const startedAt = Date.now();
  let lastResult = null;

  while (Date.now() - startedAt <= timeoutMs) {
    if (state.batch.stopRequested) {
      throw new Error(currentText.paused);
    }

    const result = await injectProfileParser(tabId, username);
    if (!isProfileLoadingResult(result)) {
      return result;
    }

    lastResult = result;
    await sleep(1500);
  }

  return {
    ok: true,
    code: "unknown",
    username,
    lastPostAt: "",
    inactiveDays: null,
    message: lastResult?.message || currentText.noEvidence
  };
}

async function saveProfileResult(account, result) {
  const checkedAt = new Date().toISOString();
  const username = account.username;
  const patch = buildProfileActivityPatch(account, result, state.settings, checkedAt);

  await updateAccount(username, patch);
  return patch;
}

function shouldStopForSafety(result) {
  return result?.code === "verification" || result?.code === "rate_limited";
}

async function runAccountChecks(accounts, options = {}) {
  if (state.batch.running) return;

  state.batch.running = true;
  state.batch.stopRequested = false;
  state.batch.message = "";
  renderBatchPanel(options.preparingMessage || currentText.preparingBatch);

  try {
    await loadAccounts();

    if (options.requireBatchEnabled && !state.settings.enableExperimentalBatchCheck) {
      renderBatchPanel(currentText.batchNotEnabled);
      return;
    }

    const usage = await getBatchUsage();
    const remainingToday = Math.max(0, Number(state.settings.experimentalDailyLimit || 100) - usage.checkedCount);
    if (remainingToday <= 0) {
      renderBatchPanel(currentText.dailyLimit);
      return;
    }

    const batchSize = Math.min(Number(options.limit || state.settings.experimentalBatchSize || 20), 20, remainingToday);
    const candidates = accounts.slice(0, batchSize);
    if (candidates.length === 0) {
      renderBatchPanel(currentText.noCandidates);
      return;
    }

    for (let index = 0; index < candidates.length; index += 1) {
      if (state.batch.stopRequested) {
        renderBatchPanel(currentText.paused);
        return;
      }

      const account = candidates[index];
      renderBatchPanel(formatMessage(options.progressTemplate || currentText.checkingAccount, {
        index: index + 1,
        total: candidates.length,
        username: account.username
      }));

      const tabId = await openProfileForBatch(account);
      await waitForTabComplete(tabId, account.username);
      await sleep(2500);

      const result = await readStableProfileActivity(tabId, account.username);
      await saveProfileResult(account, result);
      await incrementBatchUsage(1);
      await loadAccounts();

      if (shouldStopForSafety(result)) {
        renderBatchPanel(formatMessage(currentText.safetyStopped, {
          reason: result.code === "verification" ? currentText.verification : currentText.rateLimited
        }));
        return;
      }

      if (options.useDelay !== false && index < candidates.length - 1) {
        const delaySeconds = randomDelaySeconds(
          state.settings.experimentalMinDelaySeconds,
          state.settings.experimentalMaxDelaySeconds
        );
        for (let remaining = delaySeconds; remaining > 0; remaining -= 1) {
          if (state.batch.stopRequested) {
            renderBatchPanel(currentText.paused);
            return;
          }
          renderBatchPanel(formatMessage(currentText.checkedWaiting, { username: account.username, seconds: remaining }));
          await sleep(1000);
        }
      }
    }

    renderBatchPanel(formatMessage(options.doneTemplate || currentText.batchDone, { count: candidates.length }));
  } catch (error) {
    renderBatchPanel(formatMessage(currentText.batchStopped, { message: error.message }));
  } finally {
    state.batch.running = false;
    state.batch.stopRequested = false;
    await loadAccounts();
  }
}

async function runBatchCheck() {
  await loadAccounts();
  await runAccountChecks(getBatchCandidates(), {
    requireBatchEnabled: true,
    limit: state.settings.experimentalBatchSize,
    preparingMessage: currentText.preparingBatch,
    progressTemplate: currentText.checkingAccount,
    doneTemplate: currentText.batchDone
  });
}

async function runInactiveRecheck() {
  await loadAccounts();
  await runAccountChecks(getInactiveReviewCandidates(), {
    requireBatchEnabled: true,
    limit: state.settings.experimentalBatchSize,
    preparingMessage: currentText.preparingBatch,
    progressTemplate: currentText.recheckingAccount,
    doneTemplate: currentText.recheckDone
  });
}

async function runUnknownRecheck() {
  await loadAccounts();
  await runAccountChecks(getUnknownCandidates(), {
    requireBatchEnabled: true,
    limit: state.settings.experimentalBatchSize,
    preparingMessage: currentText.preparingBatch,
    progressTemplate: currentText.recheckingAccount,
    doneTemplate: currentText.recheckDone
  });
}

async function runSingleRecheck(account) {
  await runAccountChecks([getEffectiveAccount(account, state.settings)], {
    requireBatchEnabled: false,
    limit: 1,
    preparingMessage: formatMessage(currentText.recheckingAccount, { index: 1, total: 1, username: account.username }),
    progressTemplate: currentText.recheckingAccount,
    doneTemplate: currentText.recheckDone,
    useDelay: false
  });
}

function pauseBatchCheck() {
  state.batch.stopRequested = true;
  renderBatchPanel(currentText.pausing);
}

async function handleRowAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const row = event.target.closest(".account-row");
  const username = row?.dataset.username;
  const account = state.accounts.find((item) => item.username === username);
  if (!account) return;

  if (button.dataset.action === "open") {
    await chrome.tabs.create({ url: account.profileUrl || `https://x.com/${account.username}` });
    return;
  }

  if (button.dataset.action === "recheck") {
    await runSingleRecheck(account);
    return;
  }

  if (button.dataset.action === "processed") {
    await updateAccount(username, {
      processed: !account.processed,
      lastCheckedAt: account.lastCheckedAt || new Date().toISOString()
    });
  }

  if (button.dataset.action === "whitelist") {
    await updateAccount(username, {
      whitelisted: !account.whitelisted,
      lastCheckedAt: account.lastCheckedAt || new Date().toISOString()
    });
  }

  await loadAccounts();
}

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderAccounts();
});

elements.refreshResults.addEventListener("click", loadAccounts);
elements.exportCsv.addEventListener("click", exportCsv);
elements.exportJson.addEventListener("click", exportJson);
elements.startBatchCheck.addEventListener("click", runBatchCheck);
elements.recheckInactive.addEventListener("click", runInactiveRecheck);
elements.recheckUnknown.addEventListener("click", runUnknownRecheck);
elements.pauseBatchCheck.addEventListener("click", pauseBatchCheck);
elements.accountList.addEventListener("click", handleRowAction);

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});

loadAccounts().catch((error) => {
  elements.accountList.textContent = formatMessage(currentText.loadFailed, { message: error.message });
});
