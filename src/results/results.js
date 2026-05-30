import { getAccounts, getSettings, summarizeAccounts, updateAccount } from "../shared/storage.js";
import { accountsToCsv, createExportFilename, downloadTextFile } from "../shared/csvUtils.js";
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
  search: ""
};

const elements = {
  summaryTotal: document.querySelector("#summaryTotal"),
  summaryInactive: document.querySelector("#summaryInactive"),
  summaryActive: document.querySelector("#summaryActive"),
  summaryUnknown: document.querySelector("#summaryUnknown"),
  summaryWhitelisted: document.querySelector("#summaryWhitelisted"),
  summaryProcessed: document.querySelector("#summaryProcessed"),
  searchInput: document.querySelector("#searchInput"),
  refreshResults: document.querySelector("#refreshResults"),
  exportCsv: document.querySelector("#exportCsv"),
  exportJson: document.querySelector("#exportJson"),
  accountList: document.querySelector("#accountList"),
  rowTemplate: document.querySelector("#accountRowTemplate")
};

function normalizeSearch(value) {
  return String(value || "").replace(/^@/, "").trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "未读取";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未读取";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatInactiveDays(value) {
  return Number.isFinite(value) ? `${value} 天` : "未判断";
}

function updateSummary() {
  const summary = summarizeAccounts(state.accounts.map((account) => getEffectiveAccount(account, state.settings)));
  elements.summaryTotal.textContent = String(summary.total);
  elements.summaryInactive.textContent = String(summary.inactive);
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
  const row = fragment.querySelector(".account-row");
  const avatarWrap = fragment.querySelector(".avatar-wrap");
  const displayName = fragment.querySelector(".display-name");
  const username = fragment.querySelector(".username");
  const statusBadge = fragment.querySelector(".status-badge");
  const lastPost = fragment.querySelector(".last-post");
  const inactiveDays = fragment.querySelector(".inactive-days");
  const processedButton = fragment.querySelector('[data-action="processed"]');
  const whitelistButton = fragment.querySelector('[data-action="whitelist"]');

  const displayStatus = getDisplayStatus(account, state.settings);

  row.dataset.username = account.username;
  avatarWrap.append(createAvatar(account));
  displayName.textContent = account.displayName || account.username;
  username.textContent = `@${account.username}`;
  statusBadge.textContent = getStatusLabel(displayStatus);
  statusBadge.className = `status-badge ${getStatusClass(displayStatus)}`;
  lastPost.textContent = formatDate(account.lastPostAt);
  inactiveDays.textContent = formatInactiveDays(account.inactiveDays);
  processedButton.textContent = account.processed ? "取消已处理" : "标记已处理";
  whitelistButton.textContent = account.whitelisted ? "移出白名单" : "加入白名单";

  return fragment;
}

function renderAccounts() {
  updateSummary();
  elements.accountList.replaceChildren();

  const accounts = getFilteredAccounts();
  if (accounts.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = state.accounts.length === 0
      ? "暂无账户。请先在 X Following 页面手动滚动后，通过 Popup 扫描当前页面。"
      : "没有匹配当前筛选条件的账户。";
    elements.accountList.append(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const account of accounts) {
    fragment.append(renderAccount(account));
  }
  elements.accountList.append(fragment);
}

async function loadAccounts() {
  const [accounts, settings] = await Promise.all([getAccounts(), getSettings()]);
  state.accounts = accounts;
  state.settings = settings;
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
elements.accountList.addEventListener("click", handleRowAction);

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});

loadAccounts().catch((error) => {
  elements.accountList.textContent = `结果页加载失败：${error.message}`;
});
