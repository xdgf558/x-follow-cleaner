import { AccountStatus, MutualFollowStatus } from "./constants.js";
import { diffDays } from "./dateUtils.js";

function normalizeLanguage(language) {
  return language === "en" ? "en" : "zh";
}

export function getInactiveConfirmationCount(account) {
  return Math.max(0, Number(account?.inactiveConfirmationCount || 0));
}

export function getAccountStatus(account, settings = {}) {
  if (account?.lastPostAt) {
    const inactiveDays = diffDays(account.lastPostAt);
    if (inactiveDays !== null) {
      const threshold = Number(settings.inactiveThresholdDays || 30);
      if (inactiveDays <= threshold) return AccountStatus.ACTIVE;
      return getInactiveConfirmationCount(account) >= 2 ? AccountStatus.INACTIVE : AccountStatus.REVIEW;
    }
  }

  return account?.status || AccountStatus.PENDING;
}

export function getBaseStatus(account, settings = {}) {
  return getAccountStatus(account, settings);
}

export function getEffectiveAccount(account, settings = {}) {
  if (!account?.lastPostAt) {
    return {
      ...account,
      status: getAccountStatus(account, settings)
    };
  }

  const inactiveDays = diffDays(account.lastPostAt);
  return {
    ...account,
    inactiveDays,
    status: getAccountStatus(account, settings)
  };
}

export function getDisplayStatus(account, settings = {}) {
  if (account?.whitelisted) return AccountStatus.WHITELISTED;
  if (account?.processed) return AccountStatus.PROCESSED;
  return getBaseStatus(account, settings);
}

export function getStatusLabel(status, language = "zh") {
  const labels = {
    zh: {
      [AccountStatus.PENDING]: "待检查",
      [AccountStatus.REVIEW]: "待复核未活跃",
      [AccountStatus.ACTIVE]: "近期活跃",
      [AccountStatus.INACTIVE]: "已确认未活跃",
      [AccountStatus.UNKNOWN]: "无法判断",
      [AccountStatus.ERROR]: "解析失败",
      [AccountStatus.PROCESSED]: "已处理",
      [AccountStatus.WHITELISTED]: "白名单"
    },
    en: {
      [AccountStatus.PENDING]: "Pending",
      [AccountStatus.REVIEW]: "Needs review",
      [AccountStatus.ACTIVE]: "Recently active",
      [AccountStatus.INACTIVE]: "Confirmed inactive",
      [AccountStatus.UNKNOWN]: "Unknown",
      [AccountStatus.ERROR]: "Parse error",
      [AccountStatus.PROCESSED]: "Processed",
      [AccountStatus.WHITELISTED]: "Whitelist"
    }
  };

  const languageKey = normalizeLanguage(language);
  return labels[languageKey][status] || labels[languageKey][AccountStatus.PENDING];
}

export function getStatusClass(status) {
  const classes = {
    [AccountStatus.PENDING]: "status-pending",
    [AccountStatus.REVIEW]: "status-review",
    [AccountStatus.ACTIVE]: "status-active",
    [AccountStatus.INACTIVE]: "status-inactive",
    [AccountStatus.UNKNOWN]: "status-unknown",
    [AccountStatus.ERROR]: "status-error",
    [AccountStatus.PROCESSED]: "status-processed",
    [AccountStatus.WHITELISTED]: "status-whitelisted"
  };

  return classes[status] || "status-pending";
}

export function accountMatchesFilter(account, filter, settings = {}) {
  const baseStatus = getBaseStatus(account, settings);

  if (filter === "all") return true;
  if (filter === "inactive") return baseStatus === AccountStatus.INACTIVE;
  if (filter === "review") return baseStatus === AccountStatus.REVIEW;
  if (filter === "active") return baseStatus === AccountStatus.ACTIVE;
  if (filter === "unknown") {
    return baseStatus === AccountStatus.UNKNOWN || baseStatus === AccountStatus.ERROR || baseStatus === AccountStatus.PENDING;
  }
  if (filter === "whitelisted") return Boolean(account?.whitelisted);
  if (filter === "processed") return Boolean(account?.processed);
  if (filter === "followsYou") return account?.mutualFollowStatus === MutualFollowStatus.FOLLOWS_YOU;
  if (filter === "notFollowingYou") return account?.mutualFollowStatus === MutualFollowStatus.NOT_FOLLOWING_YOU;
  if (filter === "suspectedUnfollow") return Boolean(account?.suspectedUnfollow);

  return true;
}

function buildMutualFollowPatch(account = {}, result = {}, checkedAt = new Date().toISOString()) {
  if (!Object.prototype.hasOwnProperty.call(result || {}, "mutualFollowStatus")) {
    return {};
  }

  const nextStatus = result.mutualFollowStatus || MutualFollowStatus.UNKNOWN;
  if (nextStatus === MutualFollowStatus.UNKNOWN) {
    return {
      mutualFollowStatus: account?.mutualFollowStatus || MutualFollowStatus.UNKNOWN,
      followsYouLastCheckedAt: checkedAt,
      followsYouSourceText: result.followsYouSourceText || "",
      suspectedUnfollow: Boolean(account?.suspectedUnfollow),
      suspectedUnfollowAt: account?.suspectedUnfollowAt || "",
      errorMessage: result?.message || ""
    };
  }

  const wasFollowingYou = account?.mutualFollowStatus === MutualFollowStatus.FOLLOWS_YOU;
  const isNotFollowingYou = nextStatus === MutualFollowStatus.NOT_FOLLOWING_YOU;
  const suspectedUnfollow = isNotFollowingYou
    ? Boolean(account?.suspectedUnfollow || wasFollowingYou)
    : false;

  return {
    mutualFollowStatus: nextStatus,
    followsYouLastCheckedAt: checkedAt,
    followsYouSourceText: result.followsYouSourceText || "",
    suspectedUnfollow,
    suspectedUnfollowAt: suspectedUnfollow
      ? account?.suspectedUnfollowAt || checkedAt
      : ""
  };
}

export function buildProfileActivityPatch(account = {}, result = {}, settings = {}, checkedAt = new Date().toISOString()) {
  const username = String(account.username || result.username || "").replace(/^@/, "").trim().toLowerCase();
  const mutualFollowPatch = buildMutualFollowPatch(account, result, checkedAt);
  const patch = {
    profileUrl: account.profileUrl || `https://x.com/${username}`,
    lastCheckedAt: checkedAt,
    lastSourceText: result?.sourceText || "",
    lastStatusUrl: result?.statusUrl || "",
    errorMessage: result?.message || "",
    ...mutualFollowPatch
  };

  if (result?.ok && result.lastPostAt) {
    const inactiveDays = Number.isFinite(result.inactiveDays)
      ? result.inactiveDays
      : diffDays(result.lastPostAt);
    const threshold = Number(settings.inactiveThresholdDays || 30);

    if (Number.isFinite(inactiveDays) && inactiveDays > threshold) {
      const nextCount = Math.min(2, getInactiveConfirmationCount(account) + 1);
      return {
        ...patch,
        lastPostAt: result.lastPostAt,
        inactiveDays,
        status: nextCount >= 2 ? AccountStatus.INACTIVE : AccountStatus.REVIEW,
        inactiveConfirmationCount: nextCount,
        inactiveFirstSeenAt: account.inactiveFirstSeenAt || checkedAt,
        inactiveLastConfirmedAt: checkedAt,
        errorMessage: ""
      };
    }

    return {
      ...patch,
      lastPostAt: result.lastPostAt,
      inactiveDays,
      status: AccountStatus.ACTIVE,
      inactiveConfirmationCount: 0,
      inactiveFirstSeenAt: "",
      inactiveLastConfirmedAt: "",
      errorMessage: ""
    };
  }

  if (result?.ok) {
    return {
      ...patch,
      lastPostAt: "",
      inactiveDays: null,
      status: AccountStatus.UNKNOWN,
      inactiveConfirmationCount: 0,
      inactiveFirstSeenAt: "",
      inactiveLastConfirmedAt: ""
    };
  }

  return {
    ...patch,
    lastPostAt: "",
    inactiveDays: null,
    status: AccountStatus.ERROR,
    inactiveConfirmationCount: 0,
    inactiveFirstSeenAt: "",
    inactiveLastConfirmedAt: ""
  };
}
