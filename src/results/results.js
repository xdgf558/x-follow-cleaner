import { getAccounts, getBatchUsage, getSettings, incrementBatchUsage, summarizeAccounts, updateAccount } from "../shared/storage.js";
import { accountsToCsv, createExportFilename, downloadTextFile } from "../shared/csvUtils.js";
import { AccountStatus } from "../shared/constants.js";
import { diffDays } from "../shared/dateUtils.js";
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
  pauseBatchCheck: document.querySelector("#pauseBatchCheck"),
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
  renderBatchPanel();
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

function getBatchCandidates() {
  return state.accounts
    .map((account) => getEffectiveAccount(account, state.settings))
    .filter((account) => {
      if (account.whitelisted || account.processed) return false;
      if (account.status === AccountStatus.ACTIVE || account.status === AccountStatus.INACTIVE) return false;
      return Boolean(account.username);
    });
}

function renderBatchPanel(message = null) {
  if (message !== null) {
    state.batch.message = message;
  }

  const enabled = Boolean(state.settings.enableExperimentalBatchCheck);

  elements.startBatchCheck.disabled = state.batch.running || !enabled;
  elements.pauseBatchCheck.disabled = !state.batch.running;

  if (state.batch.message) {
    elements.batchStatus.textContent = state.batch.message;
    return;
  }

  if (!enabled) {
    elements.batchStatus.textContent = "默认关闭。请先到设置页开启低频自动检查。";
    return;
  }

  const candidates = getBatchCandidates();
  const batchSize = Math.min(Number(state.settings.experimentalBatchSize || 20), 20);
  elements.batchStatus.textContent = `已开启。每批最多 ${batchSize} 个，间隔 ${state.settings.experimentalMinDelaySeconds}-${state.settings.experimentalMaxDelaySeconds} 秒，每天最多 100 个。当前可检查 ${candidates.length} 个。`;
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
      throw new Error("低频检查已暂停。");
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
    message: lastResult?.message || "主页已打开，但没有稳定读取到属于该账号的公开帖子时间。"
  };
}

async function saveProfileResult(account, result) {
  const checkedAt = new Date().toISOString();
  const username = account.username;
  let patch = {
    profileUrl: account.profileUrl || `https://x.com/${username}`,
    lastCheckedAt: checkedAt,
    errorMessage: result?.message || ""
  };

  if (result?.ok && result.lastPostAt) {
    const inactiveDays = Number.isFinite(result.inactiveDays)
      ? result.inactiveDays
      : diffDays(result.lastPostAt);

    patch = {
      ...patch,
      lastPostAt: result.lastPostAt,
      inactiveDays,
      status: inactiveDays > state.settings.inactiveThresholdDays
        ? AccountStatus.INACTIVE
        : AccountStatus.ACTIVE,
      errorMessage: ""
    };
  } else if (result?.ok) {
    patch = {
      ...patch,
      lastPostAt: "",
      inactiveDays: null,
      status: AccountStatus.UNKNOWN
    };
  } else {
    patch = {
      ...patch,
      lastPostAt: "",
      inactiveDays: null,
      status: AccountStatus.ERROR
    };
  }

  await updateAccount(username, patch);
  return patch;
}

function shouldStopForSafety(result) {
  return result?.code === "verification" || result?.code === "rate_limited";
}

async function runBatchCheck() {
  if (state.batch.running) return;

  state.batch.running = true;
  state.batch.stopRequested = false;
  state.batch.message = "";
  renderBatchPanel("正在准备低频自动检查...");

  try {
    await loadAccounts();

    if (!state.settings.enableExperimentalBatchCheck) {
      renderBatchPanel("低频自动检查未开启。请先到设置页开启。");
      return;
    }

    const usage = await getBatchUsage();
    const remainingToday = Math.max(0, Number(state.settings.experimentalDailyLimit || 100) - usage.checkedCount);
    if (remainingToday <= 0) {
      renderBatchPanel("今天已经达到 100 个账户的低频检查上限，请明天再继续。");
      return;
    }

    const batchSize = Math.min(Number(state.settings.experimentalBatchSize || 20), 20, remainingToday);
    const candidates = getBatchCandidates().slice(0, batchSize);
    if (candidates.length === 0) {
      renderBatchPanel("当前没有需要低频检查的账户。");
      return;
    }

    for (let index = 0; index < candidates.length; index += 1) {
      if (state.batch.stopRequested) {
        renderBatchPanel("低频检查已暂停。");
        return;
      }

      const account = candidates[index];
      renderBatchPanel(`正在检查 ${index + 1}/${candidates.length}：@${account.username}。运行中会逐个打开主页。`);

      const tabId = await openProfileForBatch(account);
      await waitForTabComplete(tabId, account.username);
      await sleep(2500);

      const result = await readStableProfileActivity(tabId, account.username);
      await saveProfileResult(account, result);
      await incrementBatchUsage(1);
      await loadAccounts();

      if (shouldStopForSafety(result)) {
        renderBatchPanel(`检测到 ${result.code === "verification" ? "验证要求" : "访问限制"}，低频检查已停止。请手动处理后再继续。`);
        return;
      }

      if (index < candidates.length - 1) {
        const delaySeconds = randomDelaySeconds(
          state.settings.experimentalMinDelaySeconds,
          state.settings.experimentalMaxDelaySeconds
        );
        for (let remaining = delaySeconds; remaining > 0; remaining -= 1) {
          if (state.batch.stopRequested) {
            renderBatchPanel("低频检查已暂停。");
            return;
          }
          renderBatchPanel(`@${account.username} 已检查。等待 ${remaining} 秒后继续下一个账户。`);
          await sleep(1000);
        }
      }
    }

    renderBatchPanel(`本批低频检查完成，共检查 ${candidates.length} 个账户。`);
  } catch (error) {
    renderBatchPanel(`低频检查已停止：${error.message}`);
  } finally {
    state.batch.running = false;
    state.batch.stopRequested = false;
    await loadAccounts();
  }
}

function pauseBatchCheck() {
  state.batch.stopRequested = true;
  renderBatchPanel("正在暂停，当前步骤结束后会停止。");
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
elements.startBatchCheck.addEventListener("click", runBatchCheck);
elements.pauseBatchCheck.addEventListener("click", pauseBatchCheck);
elements.accountList.addEventListener("click", handleRowAction);

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setActiveFilter(button.dataset.filter));
});

loadAccounts().catch((error) => {
  elements.accountList.textContent = `结果页加载失败：${error.message}`;
});
