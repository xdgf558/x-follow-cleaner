export const STORAGE_KEYS = {
  ACCOUNTS: "xFollowCleaner.accounts",
  SETTINGS: "xFollowCleaner.settings",
  TASK_STATE: "xFollowCleaner.taskState",
  BATCH_USAGE: "xFollowCleaner.batchUsage",
  BATCH_STATE: "xFollowCleaner.batchState"
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

export const BatchStatus = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  ERROR: "error"
};

export const BatchMode = {
  PENDING: "pending",
  INACTIVE_RECHECK: "inactiveRecheck",
  UNKNOWN_RECHECK: "unknownRecheck",
  SINGLE: "single"
};

export const MutualFollowStatus = {
  FOLLOWS_YOU: "followsYou",
  NOT_FOLLOWING_YOU: "notFollowingYou",
  UNKNOWN: "unknown"
};

export const DEFAULT_BATCH_STATE = {
  status: BatchStatus.IDLE,
  mode: "",
  queue: [],
  currentIndex: 0,
  checkedCount: 0,
  tabId: null,
  currentUsername: "",
  nextRunAt: "",
  startedAt: "",
  updatedAt: "",
  completedAt: "",
  message: "",
  errorMessage: ""
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
