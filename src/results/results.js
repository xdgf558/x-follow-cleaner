import { getAccounts, getBatchState, getSettings, summarizeAccounts, updateAccount } from "../shared/storage.js";
import { accountsToCsv, createExportFilename, downloadTextFile } from "../shared/csvUtils.js";
import { AccountStatus, BatchMode, BatchStatus, DEFAULT_BATCH_STATE, STORAGE_KEYS } from "../shared/constants.js";
import { applyTranslations, formatMessage, getText } from "../shared/i18n.js";
import {
  accountMatchesFilter,
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
  batch: { ...DEFAULT_BATCH_STATE }
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

function isBatchRunning() {
  return state.batch.status === BatchStatus.RUNNING;
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
  recheckButton.disabled = isBatchRunning();
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
    state.batch = {
      ...state.batch,
      message
    };
  }

  const enabled = Boolean(state.settings.enableExperimentalBatchCheck);
  const running = isBatchRunning();

  elements.startBatchCheck.disabled = running || !enabled;
  elements.recheckInactive.disabled = running || !enabled;
  elements.recheckUnknown.disabled = running || !enabled;
  elements.pauseBatchCheck.disabled = !running;

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
  const [accounts, settings, batchState] = await Promise.all([getAccounts(), getSettings(), getBatchState()]);
  state.accounts = accounts;
  state.settings = settings;
  state.batch = batchState;
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

async function sendBatchCommand(payload, pendingMessage = currentText.preparingBatch) {
  if (pendingMessage) {
    renderBatchPanel(pendingMessage);
  }

  const response = await chrome.runtime.sendMessage(payload);
  if (!response?.ok) {
    throw new Error(response?.message || "Unknown error");
  }

  state.batch = response.batchState || await getBatchState();
  renderAccounts();
  return state.batch;
}

async function runBatchCheck() {
  await sendBatchCommand({
    type: "xFollowCleaner.batch.start",
    mode: BatchMode.PENDING
  });
}

async function runInactiveRecheck() {
  await sendBatchCommand({
    type: "xFollowCleaner.batch.start",
    mode: BatchMode.INACTIVE_RECHECK
  });
}

async function runUnknownRecheck() {
  await sendBatchCommand({
    type: "xFollowCleaner.batch.start",
    mode: BatchMode.UNKNOWN_RECHECK
  });
}

async function runSingleRecheck(account) {
  await sendBatchCommand(
    {
      type: "xFollowCleaner.batch.start",
      mode: BatchMode.SINGLE,
      username: account.username
    },
    formatMessage(currentText.recheckingAccount, { index: 1, total: 1, username: account.username })
  );
}

async function pauseBatchCheck() {
  await sendBatchCommand({
    type: "xFollowCleaner.batch.pause"
  }, currentText.pausing);
}

function runBatchAction(action) {
  action().catch((error) => {
    renderBatchPanel(formatMessage(currentText.batchStopped, { message: error.message }));
  });
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
elements.startBatchCheck.addEventListener("click", () => runBatchAction(runBatchCheck));
elements.recheckInactive.addEventListener("click", () => runBatchAction(runInactiveRecheck));
elements.recheckUnknown.addEventListener("click", () => runBatchAction(runUnknownRecheck));
elements.pauseBatchCheck.addEventListener("click", () => runBatchAction(pauseBatchCheck));
elements.accountList.addEventListener("click", handleRowAction);

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  const shouldReload = [
    STORAGE_KEYS.ACCOUNTS,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.BATCH_STATE
  ].some((key) => Object.prototype.hasOwnProperty.call(changes, key));

  if (shouldReload) {
    loadAccounts().catch((error) => {
      elements.accountList.textContent = formatMessage(currentText.loadFailed, { message: error.message });
    });
  }
});

loadAccounts().catch((error) => {
  elements.accountList.textContent = formatMessage(currentText.loadFailed, { message: error.message });
});
