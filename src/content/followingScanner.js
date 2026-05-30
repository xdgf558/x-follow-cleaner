(function initializeFollowingScanner() {
  if (window.XFollowCleanerFollowingScanner) return;

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
    "hashtag"
  ]);

  function normalizeUsername(username) {
    return String(username || "").replace(/^@/, "").trim().toLowerCase();
  }

  function isXUrl(url) {
    try {
      return X_HOSTS.has(new URL(url).hostname.replace(/^www\./, ""));
    } catch {
      return false;
    }
  }

  function isFollowingPage(url = location.href) {
    try {
      const parsedUrl = new URL(url);
      const parts = parsedUrl.pathname.split("/").filter(Boolean);
      return isXUrl(url) && parts.length === 2 && parts[1].toLowerCase() === "following";
    } catch {
      return false;
    }
  }

  function isReservedUsername(username) {
    return RESERVED_PATHS.has(normalizeUsername(username));
  }

  function isValidUsername(username) {
    return /^[a-z0-9_]{1,15}$/i.test(String(username || "")) && !isReservedUsername(username);
  }

  function textOf(element) {
    return String(element?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function hasVisibleFollowingContent() {
    return Boolean(document.querySelector('[data-testid="UserCell"], [data-testid="cellInnerDiv"] a[href]'));
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

  function detectPageState() {
    const pageText = textOf(document.body).toLowerCase();

    if (!pageText) {
      return {
        ok: false,
        code: "empty_page",
        message: "当前页面还没有加载出可读取内容，请稍后再试。"
      };
    }

    if (pageText.includes("log in") || pageText.includes("sign in to x")) {
      return {
        ok: false,
        code: "not_logged_in",
        message: "请先登录 X 后再扫描 Following 页面。"
      };
    }

    if (hasVerificationChallenge(pageText) && !hasVisibleFollowingContent()) {
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

    return { ok: true, code: "ok", message: "" };
  }

  function getProfileUrlFromAnchor(anchor) {
    try {
      const url = new URL(anchor.getAttribute("href"), location.origin);
      const parts = url.pathname.split("/").filter(Boolean);
      if (!X_HOSTS.has(url.hostname.replace(/^www\./, ""))) return null;
      if (parts.length !== 1) return null;

      const username = normalizeUsername(decodeURIComponent(parts[0]));
      if (!isValidUsername(username)) return null;

      return {
        username,
        profileUrl: `https://x.com/${username}`
      };
    } catch {
      return null;
    }
  }

  function findProfileLink(element) {
    const anchors = Array.from(element.querySelectorAll("a[href]"));

    for (const anchor of anchors) {
      const profile = getProfileUrlFromAnchor(anchor);
      if (profile) return { anchor, ...profile };
    }

    return null;
  }

  function extractDisplayName(element, username, profileAnchor) {
    const userNameBlock = element.querySelector('[data-testid="UserName"]');
    const sources = [
      ...Array.from(userNameBlock?.querySelectorAll("span") || []),
      ...Array.from(profileAnchor?.querySelectorAll("span") || []),
      profileAnchor
    ];

    for (const source of sources) {
      const value = textOf(source);
      if (!value) continue;
      if (value.startsWith("@")) continue;
      if (normalizeUsername(value) === username) continue;
      if (value.toLowerCase() === "follows you") continue;
      return value;
    }

    return username;
  }

  function extractAvatarUrl(element) {
    const images = Array.from(element.querySelectorAll("img"));
    const profileImage = images.find((image) => {
      const src = image.currentSrc || image.src || "";
      return src.includes("profile_images") || src.includes("pbs.twimg.com");
    });

    return profileImage?.currentSrc || profileImage?.src || "";
  }

  function extractBio(element) {
    const bioElement = element.querySelector('[data-testid="UserDescription"]');
    return textOf(bioElement);
  }

  function extractAccountFromElement(element) {
    const profile = findProfileLink(element);
    if (!profile) return null;

    return {
      username: profile.username,
      displayName: extractDisplayName(element, profile.username, profile.anchor),
      profileUrl: profile.profileUrl,
      avatarUrl: extractAvatarUrl(element),
      bio: extractBio(element),
      collectedAt: new Date().toISOString(),
      lastCheckedAt: "",
      lastPostAt: "",
      inactiveDays: null,
      status: "pending",
      errorMessage: "",
      processed: false,
      whitelisted: false,
      manualNote: ""
    };
  }

  function getCandidateElements() {
    const userCells = Array.from(document.querySelectorAll('[data-testid="UserCell"]'));
    if (userCells.length > 0) return userCells;

    return Array.from(document.querySelectorAll('[data-testid="cellInnerDiv"]')).filter((element) => {
      return Boolean(findProfileLink(element));
    });
  }

  function dedupeAccounts(accounts) {
    const byUsername = new Map();

    for (const account of accounts) {
      const username = normalizeUsername(account.username);
      if (!username || byUsername.has(username)) continue;
      byUsername.set(username, { ...account, username });
    }

    return Array.from(byUsername.values());
  }

  function scanVisibleFollowingAccounts() {
    if (!isXUrl(location.href)) {
      return {
        ok: false,
        code: "not_x_page",
        message: "请先打开 x.com 或 twitter.com 的 Following 页面。"
      };
    }

    if (!isFollowingPage(location.href)) {
      return {
        ok: false,
        code: "not_following_page",
        message: "当前页面不是 Following 页面，请打开 https://x.com/{username}/following 后再扫描。"
      };
    }

    const pageState = detectPageState();
    if (!pageState.ok) {
      return {
        ok: false,
        code: pageState.code,
        message: pageState.message
      };
    }

    const accounts = dedupeAccounts(
      getCandidateElements()
        .map(extractAccountFromElement)
        .filter(Boolean)
    );

    if (accounts.length === 0) {
      return {
        ok: false,
        code: "no_accounts",
        message: "当前页面没有找到已展示的关注账户。请手动滚动加载后再扫描；如果仍然为空，可能是 X DOM 结构已变化。"
      };
    }

    return {
      ok: true,
      code: "ok",
      message: `已从当前页面读取 ${accounts.length} 个已展示账户。`,
      accounts,
      scannedAt: new Date().toISOString()
    };
  }

  window.XFollowCleanerFollowingScanner = {
    isFollowingPage,
    scanVisibleFollowingAccounts,
    extractAccountFromElement,
    normalizeUsername,
    dedupeAccounts
  };
})();
