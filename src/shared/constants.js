export const STORAGE_KEYS = {
  ACCOUNTS: "xFollowCleaner.accounts",
  SETTINGS: "xFollowCleaner.settings",
  TASK_STATE: "xFollowCleaner.taskState",
  BATCH_USAGE: "xFollowCleaner.batchUsage"
};

export const AccountStatus = {
  PENDING: "pending",
  REVIEW: "review",
  ACTIVE: "active",
  INACTIVE: "inactive",
  UNKNOWN: "unknown",
  ERROR: "error",
  PROCESSED: "processed",
  WHITELISTED: "whitelisted"
};

export const DEFAULT_SETTINGS = {
  appLanguage: "zh",
  inactiveThresholdDays: 30,
  hideWhitelisted: true,
  showUnknown: true,
  defaultSort: "inactiveDaysDesc",
  languageHint: "en",
  enableConservativeMode: true,
  conservativeScanCooldownSeconds: 30,
  enableExperimentalBatchCheck: false,
  experimentalBatchSize: 20,
  experimentalMinDelaySeconds: 15,
  experimentalMaxDelaySeconds: 30,
  experimentalDailyLimit: 100
};

export const DEFAULT_TASK_STATE = {
  currentStage: "idle",
  lastAction: "",
  totalAccounts: 0,
  pendingAccounts: 0,
  inactiveAccounts: 0,
  reviewAccounts: 0,
  unknownAccounts: 0,
  activeAccounts: 0,
  lastUpdatedAt: "",
  lastScanAttemptAt: "",
  message: ""
};

export const X_HOSTS = new Set(["x.com", "twitter.com"]);

export const RESERVED_X_PATHS = new Set([
  "home",
  "explore",
  "notifications",
  "messages",
  "settings",
  "i",
  "search",
  "compose",
  "intent",
  "privacy",
  "tos",
  "login",
  "logout",
  "signup",
  "hashtag",
  "following",
  "followers",
  "verified_followers",
  "with_replies",
  "media",
  "likes",
  "lists",
  "communities",
  "jobs"
]);
