(function initializeProfileActivityParser() {
  const PARSER_VERSION = "0.5.1";
  if (window.XFollowCleanerProfileParser?.version === PARSER_VERSION) return;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MutualFollowStatus = {
    FOLLOWS_YOU: "followsYou",
    NOT_FOLLOWING_YOU: "notFollowingYou",
    UNKNOWN: "unknown"
  };
  const X_HOSTS = new Set(["x.com", "twitter.com"]);
  const RESERVED_PATHS = new Set([
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

  const MONTHS = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11
  };

  function normalizeUsername(username) {
    return String(username || "").replace(/^@/, "").trim().toLowerCase();
  }

  function getProfileUsername(url = location.href) {
    try {
      const parsedUrl = new URL(url);
      const parts = parsedUrl.pathname.split("/").filter(Boolean);
      if (parts.length !== 1) return "";

      const username = normalizeUsername(decodeURIComponent(parts[0]));
      if (!/^[a-z0-9_]{1,15}$/i.test(username)) return "";
      if (RESERVED_PATHS.has(username)) return "";
      return username;
    } catch {
      return "";
    }
  }

  function isProfilePage(url = location.href) {
    try {
      const parsedUrl = new URL(url);
      const host = parsedUrl.hostname.replace(/^www\./, "");
      return X_HOSTS.has(host) && Boolean(getProfileUsername(url));
    } catch {
      return false;
    }
  }

  function textOf(element) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function hasVisibleProfileContent() {
    return Boolean(document.querySelector('article[data-testid="tweet"], [data-testid="UserName"]'));
  }

  function hasVerificationChallenge(pageText) {
    const challengePhrases = [
      "verify your account",
      "verify your identity",
      "verify that you are human",
      "verify you are human",
      "confirm your identity",
      "complete this challenge",
      "complete the challenge",
      "captcha",
      "are you a robot",
      "unusual activity",
      "unusual login activity",
      "suspicious activity",
      "help us keep your account safe",
      "account is temporarily locked",
      "temporarily locked your account",
      "authenticate your account"
    ];

    return challengePhrases.some((phrase) => pageText.includes(phrase));
  }

  function detectProfileAccessState() {
    const pageText = textOf(document.body).toLowerCase();

    if (!pageText) {
      return {
        ok: false,
        code: "empty_page",
        message: "当前主页还没有加载出可读取内容，请稍后再试。"
      };
    }

    if (pageText.includes("log in") || pageText.includes("sign in to x")) {
      return {
        ok: false,
        code: "not_logged_in",
        message: "请先登录 X 后再读取主页。"
      };
    }

    if (hasVerificationChallenge(pageText) && !hasVisibleProfileContent()) {
      return {
        ok: false,
        code: "verification",
        message: "页面疑似出现验证要求，请停止使用插件并手动处理。"
      };
    }

    if (
      pageText.includes("rate limit") ||
      pageText.includes("try again later") ||
      pageText.includes("temporarily limited")
    ) {
      return {
        ok: false,
        code: "rate_limited",
        message: "页面疑似出现访问限制，请停止使用插件并稍后再试。"
      };
    }

    if (pageText.includes("something went wrong")) {
      return {
        ok: false,
        code: "page_error",
        message: "X 页面显示异常，请刷新页面或稍后再试。"
      };
    }

    if ((pageText.includes("doesn") && pageText.includes("exist")) || pageText.includes("account suspended")) {
      return {
        ok: false,
        code: "unavailable",
        message: "账户不存在或已被暂停，无法读取公开发帖时间。"
      };
    }

    if (pageText.includes("these posts are protected") || pageText.includes("posts are protected")) {
      return {
        ok: true,
        code: "protected",
        message: "账户受保护，无法读取公开帖子。"
      };
    }

    return { ok: true, code: "ok", message: "" };
  }

  function cleanTimeText(text) {
    return String(text || "")
      .replace(/\u00b7/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseRelativeTime(text, now = new Date()) {
    const cleanText = cleanTimeText(text).toLowerCase();
    const match = cleanText.match(/^(\d+)\s*(s|m|h|d|sec|secs|min|mins|hr|hrs|hour|hours|day|days)$/);
    if (!match) return null;

    const value = Number(match[1]);
    if (!Number.isFinite(value)) return null;

    const unit = match[2];
    if (unit.startsWith("s")) return new Date(now.getTime() - value * 1000);
    if (unit.startsWith("m")) return new Date(now.getTime() - value * 60 * 1000);
    if (unit === "h" || unit.startsWith("hr") || unit.startsWith("hour")) {
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    }
    if (unit === "d" || unit.startsWith("day")) {
      return new Date(now.getTime() - value * DAY_MS);
    }

    return null;
  }

  function parseAbsoluteXDate(text, now = new Date()) {
    const cleanText = cleanTimeText(text);
    const match = cleanText.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
    if (!match) return null;

    const month = MONTHS[match[1].toLowerCase()];
    const day = Number(match[2]);
    const explicitYear = match[3] ? Number(match[3]) : null;
    if (month === undefined || !Number.isFinite(day) || day < 1 || day > 31) return null;

    let year = explicitYear || now.getFullYear();
    let date = new Date(year, month, day, 12, 0, 0, 0);
    if (!explicitYear && date.getTime() > now.getTime() + DAY_MS) {
      year -= 1;
      date = new Date(year, month, day, 12, 0, 0, 0);
    }

    return date;
  }

  function parseXTimeText(text, now = new Date()) {
    return parseRelativeTime(text, now) || parseAbsoluteXDate(text, now);
  }

  function calculateInactiveDays(lastPostAt, now = new Date()) {
    const date = lastPostAt instanceof Date ? lastPostAt : new Date(lastPostAt);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
  }

  function getStatusLinkInfo(href) {
    try {
      const parsedUrl = new URL(href, location.origin);
      const host = parsedUrl.hostname.replace(/^www\./, "");
      if (!X_HOSTS.has(host)) return null;

      const parts = parsedUrl.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
      const username = normalizeUsername(parts[0]);
      if (!username || RESERVED_PATHS.has(username)) return null;
      if (parts[1] !== "status" || !parts[2]) return null;

      return {
        username,
        url: parsedUrl.href
      };
    } catch {
      return null;
    }
  }

  function parseTimeElement(timeElement, now = new Date()) {
    const datetime = timeElement.getAttribute("datetime");
    if (datetime) {
      const parsedDate = new Date(datetime);
      if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() <= now.getTime() + DAY_MS) {
        return parsedDate;
      }
    }

    const parsedTextDate = parseXTimeText(timeElement.textContent, now);
    if (parsedTextDate && parsedTextDate.getTime() <= now.getTime() + DAY_MS) {
      return parsedTextDate;
    }

    return null;
  }

  function isPinnedArticle(article) {
    const socialContext = textOf(article.querySelector('[data-testid="socialContext"]')).toLowerCase();
    const articleText = textOf(article).toLowerCase();
    return (
      socialContext.includes("pinned") ||
      socialContext.includes("置顶") ||
      articleText.startsWith("pinned") ||
      articleText.startsWith("置顶")
    );
  }

  function getVisibleTweetArticles() {
    return Array.from(document.querySelectorAll('article[data-testid="tweet"]')).filter((article) => {
      const rect = article.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function hasExplicitEmptyTimelineMessage() {
    const pageText = textOf(document.body).toLowerCase();
    const emptyPhrases = [
      "hasn't posted",
      "hasn’t posted",
      "no posts yet",
      "还没有发布",
      "尚未发布",
      "没有发布任何",
      "沒有發佈",
      "尚未發佈",
      "沒有任何貼文"
    ];

    return emptyPhrases.some((phrase) => pageText.includes(phrase));
  }

  function isTimelineReadyForUnknown() {
    if (hasExplicitEmptyTimelineMessage()) return true;

    const articles = getVisibleTweetArticles();
    if (articles.length === 0) return false;

    return articles.some((article) => !isPinnedArticle(article));
  }

  function hasProfileHeaderForUsername(username) {
    const normalizedUsername = normalizeUsername(username);
    if (!normalizedUsername) return false;

    const userNameElement = document.querySelector('[data-testid="UserName"]');
    if (!userNameElement) return false;

    return textOf(userNameElement).toLowerCase().includes(`@${normalizedUsername}`);
  }

  function getProfileHeaderRoot(username) {
    const normalizedUsername = normalizeUsername(username);
    const userNameElement = document.querySelector('[data-testid="UserName"]');
    if (!normalizedUsername || !userNameElement) return null;

    let current = userNameElement;
    let bestMatch = null;

    for (let depth = 0; depth < 8 && current; depth += 1) {
      const text = textOf(current).toLowerCase();
      const rect = current.getBoundingClientRect();
      if (text.includes(`@${normalizedUsername}`) && rect.width > 0 && rect.height > 0) {
        bestMatch = current;
        if (
          text.includes("following") ||
          text.includes("followers") ||
          text.includes("joined") ||
          text.includes("跟随中") ||
          text.includes("跟隨中") ||
          text.includes("关注者") ||
          text.includes("跟隨者") ||
          text.includes("已加入")
        ) {
          return current;
        }
      }
      current = current.parentElement;
    }

    return bestMatch;
  }

  function findFollowsYouPhrase(text) {
    const cleanText = textOf({ textContent: text });
    const lowerText = cleanText.toLowerCase();
    const phrases = [
      { test: /\bfollows you(?: back)?\b/i, label: "Follows you" },
      { test: /关注了你|關注了你|关注你|關注你|跟随你|跟隨你/, label: "跟随你" }
    ];

    return phrases.find((phrase) => phrase.test.test(lowerText) || phrase.test.test(cleanText))?.label || "";
  }

  function parseMutualFollowStatus(profileUsername = getProfileUsername()) {
    const headerRoot = getProfileHeaderRoot(profileUsername);
    if (!headerRoot) {
      return {
        mutualFollowStatus: MutualFollowStatus.UNKNOWN,
        followsYouSourceText: ""
      };
    }

    const headerText = textOf(headerRoot);
    const followsYouPhrase = findFollowsYouPhrase(headerText);
    if (followsYouPhrase) {
      return {
        mutualFollowStatus: MutualFollowStatus.FOLLOWS_YOU,
        followsYouSourceText: followsYouPhrase
      };
    }

    return {
      mutualFollowStatus: MutualFollowStatus.NOT_FOLLOWING_YOU,
      followsYouSourceText: "主页头部未显示 follows-you 标记。"
    };
  }

  function parseLatestVisiblePostTime(profileUsername = getProfileUsername()) {
    const normalizedUsername = normalizeUsername(profileUsername);
    if (!normalizedUsername) return null;

    const articles = getVisibleTweetArticles();
    const candidates = [];
    const now = new Date();

    for (const article of articles) {
      if (isPinnedArticle(article)) continue;

      for (const timeElement of Array.from(article.querySelectorAll("time"))) {
        const statusLink = timeElement.closest("a[href]");
        const statusLinkInfo = getStatusLinkInfo(statusLink?.getAttribute("href"));
        if (!statusLinkInfo || statusLinkInfo.username !== normalizedUsername) continue;

        const parsedDate = parseTimeElement(timeElement, now);
        if (!parsedDate) continue;

        candidates.push({
          lastPostAt: parsedDate.toISOString(),
          sourceText: timeElement.textContent || timeElement.getAttribute("datetime") || "",
          statusUrl: statusLinkInfo.url
        });
      }
    }

    candidates.sort((a, b) => new Date(b.lastPostAt).getTime() - new Date(a.lastPostAt).getTime());
    return candidates[0] || null;
  }

  function scanProfileActivity(expectedUsername = "") {
    if (!isProfilePage(location.href)) {
      return {
        ok: false,
        code: "not_profile_page",
        username: normalizeUsername(expectedUsername),
        message: "当前页面不是 X 账户主页，请手动打开某个账户主页后再读取。"
      };
    }

    const username = getProfileUsername(location.href);
    const expected = normalizeUsername(expectedUsername);
    if (expected && username !== expected) {
      return {
        ok: false,
        code: "profile_loading",
        username: expected,
        message: "目标主页仍在切换中，暂不保存旧页面结果。"
      };
    }

    const accessState = detectProfileAccessState();
    if (!accessState.ok) {
      return {
        ok: false,
        code: accessState.code,
        username,
        message: accessState.message
      };
    }

    const latestPost = parseLatestVisiblePostTime(username);
    const mutualFollow = parseMutualFollowStatus(username);
    if (expected && !latestPost && !hasProfileHeaderForUsername(expected)) {
      return {
        ok: false,
        code: "profile_loading",
        username: expected,
        message: "目标主页内容还没有稳定加载，暂不保存旧页面结果。"
      };
    }

    if (!latestPost && accessState.code !== "protected" && !isTimelineReadyForUnknown()) {
      return {
        ok: false,
        code: "profile_loading",
        username: expected || username,
        ...mutualFollow,
        message: "主页头部已加载，但帖子时间线仍在加载中，继续等待最近发帖时间。"
      };
    }

    if (!latestPost) {
      return {
        ok: true,
        code: accessState.code === "protected" ? "protected" : "unknown",
        username,
        lastPostAt: "",
        inactiveDays: null,
        ...mutualFollow,
        message: accessState.message || "当前可见主页内容中没有找到公开帖子时间；可能没有公开帖子，或 X DOM 结构已变化。"
      };
    }

    return {
      ok: true,
      code: "ok",
      username,
      lastPostAt: latestPost.lastPostAt,
      inactiveDays: calculateInactiveDays(latestPost.lastPostAt),
      sourceText: latestPost.sourceText,
      statusUrl: latestPost.statusUrl,
      ...mutualFollow,
      message: "已读取当前主页中属于该账号的最新公开发帖时间。"
    };
  }

  window.XFollowCleanerProfileParser = {
    version: PARSER_VERSION,
    isProfilePage,
    getStatusLinkInfo,
    parseLatestVisiblePostTime,
    parseMutualFollowStatus,
    parseXTimeText,
    calculateInactiveDays,
    detectProfileAccessState,
    scanProfileActivity
  };
})();
