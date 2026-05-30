import {
  clearAccounts,
  getAccounts,
  getSettings,
  getTaskState,
  saveTaskState,
  summarizeAccounts,
  updateAccount,
  upsertAccounts
} from "../shared/storage.js";
import { AccountStatus } from "../shared/constants.js";
import { diffDays } from "../shared/dateUtils.js";
import { getProfileUsernameFromUrl, isFollowingUrl, isProfileUrl, isXUrl } from "../shared/domUtils.js";
import { getEffectiveAccount } from "../shared/statusUtils.js";

const elements = {
  totalAccounts: document.querySelector("#totalAccounts"),
  inactiveAccounts: document.querySelector("#inactiveAccounts"),
  activeAccounts: document.querySelector("#activeAccounts"),
  unknownAccounts: document.querySelector("#unknownAccounts"),
  whitelistedAccounts: document.querySelector("#whitelistedAccounts"),
  processedAccounts: document.querySelector("#processedAccounts"),
  statusMessage: document.querySelector("#statusMessage"),
  scanCurrentPage: document.querySelector("#scanCurrentPage"),
  readProfileActivity: document.querySelector("#readProfileActivity"),
  openResults: document.querySelector("#openResults"),
  openOptions: document.querySelector("#openOptions"),
  clearLocalData: document.querySelector("#clearLocalData")
};

let scanCooldownTimerId = null;

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function getScanCooldownRemainingSeconds(settings, taskState, now = Date.now()) {
  if (!settings.enableConservativeMode) return 0;

  const cooldownSeconds = Number(settings.conservativeScanCooldownSeconds || 30);
  const lastScanAt = Date.parse(taskState.lastScanAttemptAt || "");
  if (!Number.isFinite(lastScanAt)) return 0;

  return Math.max(0, Math.ceil((lastScanAt + cooldownSeconds * 1000 - now) / 1000));
}

function renderScanCooldown(settings, taskState) {
  if (scanCooldownTimerId) {
    window.clearTimeout(scanCooldownTimerId);
    scanCooldownTimerId = null;
  }

  const remainingSeconds = getScanCooldownRemainingSeconds(settings, taskState);
  if (remainingSeconds > 0) {
    elements.scanCurrentPage.disabled = true;
    elements.scanCurrentPage.textContent = `扫描当前页面（${remainingSeconds}s）`;
    scanCooldownTimerId = window.setTimeout(() => {
      refreshPopup().catch((error) => {
        setStatus(`Popup 刷新失败：${error.message}`);
      });
    }, 1000);
    return;
  }

  elements.scanCurrentPage.disabled = false;
  elements.scanCurrentPage.textContent = "扫描当前页面";
}

async function refreshPopup() {
  const [accounts, taskState, settings] = await Promise.all([getAccounts(), getTaskState(), getSettings()]);
  const summary = summarizeAccounts(accounts.map((account) => getEffectiveAccount(account, settings)));

  elements.totalAccounts.textContent = String(summary.total);
  elements.inactiveAccounts.textContent = String(summary.inactive);
  elements.activeAccounts.textContent = String(summary.active);
  elements.unknownAccounts.textContent = String(summary.unknown);
  elements.whitelistedAccounts.textContent = String(summary.whitelisted);
  elements.processedAccounts.textContent = String(summary.processed);

  setStatus(taskState.message || "等待用户手动操作。");
  renderScanCooldown(settings, taskState);
}

async function openExtensionPage(path) {
  await chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isXTab(tab) {
  return isXUrl(tab?.url);
}

function isFollowingTab(tab) {
  return isFollowingUrl(tab?.url);
}

function isProfileTab(tab) {
  return isProfileUrl(tab?.url);
}

function getUsernameFromProfileTab(tab) {
  return getProfileUsernameFromUrl(tab?.url);
}

async function injectFollowingScanner(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/content/followingScanner.js"]
  });

  const [injectionResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return window.XFollowCleanerFollowingScanner?.scanVisibleFollowingAccounts?.() || {
        ok: false,
        code: "scanner_missing",
        message: "扫描脚本未能加载，请刷新页面后再试。"
      };
    }
  });

  return injectionResult?.result;
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

async function scanCurrentPage() {
  elements.scanCurrentPage.disabled = true;
  elements.scanCurrentPage.textContent = "正在扫描...";
  setStatus("正在读取当前页面已经展示的关注账户...");
  let scanAttemptAt = "";

  try {
    const tab = await getActiveTab();
    const settings = await getSettings();
    const taskState = await getTaskState();

    if (!tab?.id || !isXTab(tab)) {
      const message = "请先打开 x.com 或 twitter.com 的 Following 页面。";
      await saveTaskState({ currentStage: "stage-2", lastAction: "scanVisibleFollowing", message });
      setStatus(message);
      return;
    }

    if (!isFollowingTab(tab)) {
      const message = "当前页面不是 Following 页面，请打开 https://x.com/{username}/following 后再扫描。";
      await saveTaskState({ currentStage: "stage-2", lastAction: "scanVisibleFollowing", message });
      setStatus(message);
      return;
    }

    const remainingSeconds = getScanCooldownRemainingSeconds(settings, taskState);
    if (remainingSeconds > 0) {
      const message = `保守验证节奏已开启，请等待 ${remainingSeconds} 秒后再扫描当前页面。`;
      await saveTaskState({
        currentStage: "safety-cooldown",
        lastAction: "scanVisibleFollowing",
        lastScanAttemptAt: taskState.lastScanAttemptAt,
        message
      });
      await refreshPopup();
      return;
    }

    scanAttemptAt = new Date().toISOString();
    const scanResult = await injectFollowingScanner(tab.id);
    if (!scanResult?.ok) {
      const message = scanResult?.message || "没有读取到账户，请确认页面已经加载 Following 列表。";
      await saveTaskState({ currentStage: "stage-2", lastAction: "scanVisibleFollowing", lastScanAttemptAt: scanAttemptAt, message });
      setStatus(message);
      return;
    }

    const allAccounts = await upsertAccounts(scanResult.accounts);
    const message = `本次读取 ${scanResult.accounts.length} 个账户，本地共保存 ${allAccounts.length} 个账户。`;
    await saveTaskState({
      currentStage: "stage-2",
      lastAction: "scanVisibleFollowing",
      totalAccounts: allAccounts.length,
      lastScanAttemptAt: scanAttemptAt,
      message
    });
    await refreshPopup();
  } catch (error) {
    const message = `扫描失败：${error.message}`;
    await saveTaskState({
      currentStage: "stage-2",
      lastAction: "scanVisibleFollowing",
      ...(scanAttemptAt ? { lastScanAttemptAt: scanAttemptAt } : {}),
      message
    });
    setStatus(message);
  } finally {
    await refreshPopup();
  }
}

async function readProfileActivity() {
  elements.readProfileActivity.disabled = true;
  setStatus("正在读取当前主页可见的最近公开发帖时间...");

  try {
    const tab = await getActiveTab();

    if (!tab?.id || !isXTab(tab)) {
      const message = "请先手动打开 x.com 或 twitter.com 上的账户主页。";
      await saveTaskState({ currentStage: "stage-4", lastAction: "readProfileActivity", message });
      setStatus(message);
      return;
    }

    if (!isProfileTab(tab)) {
      const message = "当前页面不是账户主页，请从结果页手动打开某个账户主页后再读取。";
      await saveTaskState({ currentStage: "stage-4", lastAction: "readProfileActivity", message });
      setStatus(message);
      return;
    }

    const expectedUsername = getUsernameFromProfileTab(tab);
    const result = await injectProfileParser(tab.id, expectedUsername);
    const username = result?.username || expectedUsername;
    const settings = await getSettings();
    const checkedAt = new Date().toISOString();

    let patch = {
      username,
      profileUrl: `https://x.com/${username}`,
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
        status: inactiveDays > settings.inactiveThresholdDays
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

    const message = result?.ok && result.lastPostAt
      ? `已读取 @${username}，未活跃 ${patch.inactiveDays} 天，状态为 ${patch.status === AccountStatus.INACTIVE ? "疑似未活跃" : "30 天内活跃"}。`
      : `@${username} ${patch.status === AccountStatus.UNKNOWN ? "无法判断" : "读取失败"}：${patch.errorMessage || "当前可见内容中没有找到公开帖子时间。"}`;

    await saveTaskState({
      currentStage: "stage-4",
      lastAction: "readProfileActivity",
      message
    });
    await refreshPopup();
  } catch (error) {
    const message = `读取主页失败：${error.message}`;
    await saveTaskState({ currentStage: "stage-4", lastAction: "readProfileActivity", message });
    setStatus(message);
  } finally {
    elements.readProfileActivity.disabled = false;
  }
}

async function clearLocalData() {
  const confirmed = confirm("确认清空本地保存的账户数据？此操作不会影响 X 账户。");
  if (!confirmed) return;

  await clearAccounts();
  await refreshPopup();
}

async function showStagePlaceholder(actionName) {
  const message = `${actionName} 将在后续阶段启用。当前阶段只提供插件壳子和本地数据状态。`;
  await saveTaskState({
    currentStage: "stage-1",
    lastAction: actionName,
    message
  });
  setStatus(message);
}

elements.scanCurrentPage.addEventListener("click", scanCurrentPage);
elements.readProfileActivity.addEventListener("click", readProfileActivity);
elements.openResults.addEventListener("click", () => openExtensionPage("src/results/results.html"));
elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
elements.clearLocalData.addEventListener("click", clearLocalData);

refreshPopup().catch((error) => {
  setStatus(`Popup 初始化失败：${error.message}`);
});
