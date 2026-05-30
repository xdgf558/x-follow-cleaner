import { AccountStatus } from "./constants.js";
import { diffDays } from "./dateUtils.js";

export function getAccountStatus(account, settings = {}) {
  if (account?.lastPostAt) {
    const inactiveDays = diffDays(account.lastPostAt);
    if (inactiveDays !== null) {
      const threshold = Number(settings.inactiveThresholdDays || 30);
      return inactiveDays > threshold ? AccountStatus.INACTIVE : AccountStatus.ACTIVE;
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

export function getStatusLabel(status) {
  const labels = {
    [AccountStatus.PENDING]: "待检查",
    [AccountStatus.ACTIVE]: "30 天内活跃",
    [AccountStatus.INACTIVE]: "超过 30 天未活跃",
    [AccountStatus.UNKNOWN]: "无法判断",
    [AccountStatus.ERROR]: "解析失败",
    [AccountStatus.PROCESSED]: "已处理",
    [AccountStatus.WHITELISTED]: "白名单"
  };

  return labels[status] || "待检查";
}

export function getStatusClass(status) {
  const classes = {
    [AccountStatus.PENDING]: "status-pending",
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
  if (filter === "active") return baseStatus === AccountStatus.ACTIVE;
  if (filter === "unknown") {
    return baseStatus === AccountStatus.UNKNOWN || baseStatus === AccountStatus.ERROR || baseStatus === AccountStatus.PENDING;
  }
  if (filter === "whitelisted") return Boolean(account?.whitelisted);
  if (filter === "processed") return Boolean(account?.processed);

  return true;
}
