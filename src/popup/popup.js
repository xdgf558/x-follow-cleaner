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
import { AccountStatus, MutualFollowStatus } from "../shared/constants.js";
import { getProfileUsernameFromUrl, isFollowingUrl, isProfileUrl, isXUrl } from "../shared/domUtils.js";
import { applyTranslations, formatMessage, getText } from "../shared/i18n.js";
import { buildProfileActivityPatch, getEffectiveAccount } from "../shared/statusUtils.js";

const elements = {
  totalAccounts: document.querySelector("#totalAccounts"),
  inactiveAccounts: document.querySelector("#inactiveAccounts"),
  reviewAccounts: document.querySelector("#reviewAccounts"),
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
let currentText = getText("zh");

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
    elements.scanCurrentPage.textContent = formatMessage(currentText.scanCurrentPageWithSeconds, { seconds: remainingSeconds });
    scanCooldownTimerId = window.setTimeout(() => {
      refreshPopup().catch((error) => {
        setStatus(formatMessage(currentText.loadFailed, { message: error.message }));
      });
    }, 1000);
    return;
  }

  elements.scanCurrentPage.disabled = false;
  elements.scanCurrentPage.textContent = currentText.scanCurrentPage;
}

async function refreshPopup() {
  const [accounts, taskState, settings] = await Promise.all([getAccounts(), getTaskState(), getSettings()]);
  currentText = getText(settings);
  applyTranslations(document, currentText, settings.appLanguage);
  const summary = summarizeAccounts(accounts.map((account) => getEffectiveAccount(account, settings)));

  elements.totalAccounts.textContent = String(summary.total);
  elements.inactiveAccounts.textContent = String(summary.inactive);
  elements.reviewAccounts.textContent = String(summary.review);
  elements.activeAccounts.textContent = String(summary.active);
  elements.unknownAccounts.textContent = String(summary.unknown);
  elements.whitelistedAccounts.textContent = String(summary.whitelisted);
  elements.processedAccounts.textContent = String(summary.processed);

  setStatus(taskState.message || currentText.waiting);
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

function formatMutualFollowMessage(patch) {
  if (patch.suspectedUnfollow) return currentText.suspectedUnfollow;
  if (patch.mutualFollowStatus === MutualFollowStatus.FOLLOWS_YOU) return currentText.followsYou;
  if (patch.mutualFollowStatus === MutualFollowStatus.NOT_FOLLOWING_YOU) return currentText.notFollowingYou;
  return "";
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
  elements.scanCurrentPage.textContent = currentText.scanning;
  setStatus(currentText.readingFollowing);
  let scanAttemptAt = "";

  try {
    const tab = await getActiveTab();
    const settings = await getSettings();
    const taskState = await getTaskState();

    if (!tab?.id || !isXTab(tab)) {
      const message = currentText.needFollowingPage;
      await saveTaskState({ currentStage: "stage-2", lastAction: "scanVisibleFollowing", message });
      setStatus(message);
      return;
    }

    if (!isFollowingTab(tab)) {
      const message = formatMessage(currentText.notFollowingPage, { username: "{username}" });
      await saveTaskState({ currentStage: "stage-2", lastAction: "scanVisibleFollowing", message });
      setStatus(message);
      return;
    }

    const remainingSeconds = getScanCooldownRemainingSeconds(settings, taskState);
    if (remainingSeconds > 0) {
      const message = formatMessage(currentText.cooldownMessage, { seconds: remainingSeconds });
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
      const message = scanResult?.message || currentText.scanEmpty;
      await saveTaskState({ currentStage: "stage-2", lastAction: "scanVisibleFollowing", lastScanAttemptAt: scanAttemptAt, message });
      setStatus(message);
      return;
    }

    const allAccounts = await upsertAccounts(scanResult.accounts);
    const message = formatMessage(currentText.scanSuccess, { count: scanResult.accounts.length, total: allAccounts.length });
    await saveTaskState({
      currentStage: "stage-2",
      lastAction: "scanVisibleFollowing",
      totalAccounts: allAccounts.length,
      lastScanAttemptAt: scanAttemptAt,
      message
    });
    await refreshPopup();
  } catch (error) {
    const message = formatMessage(currentText.scanFailed, { message: error.message });
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
  setStatus(currentText.readProfileWorking);

  try {
    const tab = await getActiveTab();

    if (!tab?.id || !isXTab(tab)) {
      const message = currentText.needProfilePage;
      await saveTaskState({ currentStage: "stage-4", lastAction: "readProfileActivity", message });
      setStatus(message);
      return;
    }

    if (!isProfileTab(tab)) {
      const message = currentText.notProfilePage;
      await saveTaskState({ currentStage: "stage-4", lastAction: "readProfileActivity", message });
      setStatus(message);
      return;
    }

    const expectedUsername = getUsernameFromProfileTab(tab);
    const result = await injectProfileParser(tab.id, expectedUsername);
    const username = result?.username || expectedUsername;
    const settings = await getSettings();
    const checkedAt = new Date().toISOString();
    const accounts = await getAccounts();
    const existingAccount = accounts.find((account) => account.username === username) || {
      username,
      profileUrl: `https://x.com/${username}`
    };

    const patch = {
      ...buildProfileActivityPatch(existingAccount, result, settings, checkedAt),
      username,
      profileUrl: existingAccount.profileUrl || `https://x.com/${username}`
    };

    await updateAccount(username, patch);

    let message = "";
    if (result?.ok && result.lastPostAt && patch.status === AccountStatus.ACTIVE) {
      message = formatMessage(currentText.profileReadActive, { username, days: patch.inactiveDays });
    } else if (result?.ok && result.lastPostAt && patch.status === AccountStatus.REVIEW) {
      message = formatMessage(currentText.profileReadReview, { username, days: patch.inactiveDays });
    } else if (result?.ok && result.lastPostAt) {
      message = formatMessage(currentText.profileReadInactive, { username, days: patch.inactiveDays });
    } else {
      message = formatMessage(currentText.profileReadFailed, {
        username,
        status: patch.status === AccountStatus.UNKNOWN ? currentText.resultUnknown : currentText.resultError,
        message: patch.errorMessage || currentText.noEvidence
      });
    }

    const mutualMessage = formatMutualFollowMessage(patch);
    if (mutualMessage) {
      message = `${message} ${currentText.mutualFollow}: ${mutualMessage}`;
    }

    await saveTaskState({
      currentStage: "stage-4",
      lastAction: "readProfileActivity",
      message
    });
    await refreshPopup();
  } catch (error) {
    const message = formatMessage(currentText.readFailed, { message: error.message });
    await saveTaskState({ currentStage: "stage-4", lastAction: "readProfileActivity", message });
    setStatus(message);
  } finally {
    elements.readProfileActivity.disabled = false;
  }
}

async function clearLocalData() {
  const confirmed = confirm(currentText.clearConfirm);
  if (!confirmed) return;

  await clearAccounts();
  await saveTaskState({ currentStage: "idle", lastAction: "clearLocalData", message: currentText.cleared });
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
  setStatus(formatMessage(currentText.loadFailed, { message: error.message }));
});
