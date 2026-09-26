/* Eye of Zuck v2 — deteccao Instagram-only (espelha src/lib/profile-url.ts). */
(function (global) {
  const RESERVED = new Set([
    "about", "accounts", "api", "blog", "challenge", "create", "developer",
    "direct", "directory", "emails", "explore", "graphql", "help", "legal",
    "lite", "locations", "nametag", "p", "popular", "press", "privacy",
    "reel", "reels", "session", "static", "stories", "tags", "tv", "web",
    "your_activity", "youractivity", "settings", "support", "terms",
    "safety", "community", "features", "download", "meta",
  ]);

  function normalizeHandle(handle) {
    return String(handle || "").replace(/^@/, "").replace(/\/+$/, "").trim().toLowerCase();
  }

  function isValidHandle(handle) {
    if (!handle || handle.length < 2 || handle.length > 30) return false;
    if (RESERVED.has(handle)) return false;
    return /^[a-z0-9._]+$/.test(handle);
  }

  function profileUrl(handle) {
    return `https://www.instagram.com/${handle}/`;
  }

  function detectFromUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      if (host !== "instagram.com") {
        return { platform: null, handle: null, url: null, pageType: "unknown" };
      }
      const parts = url.pathname.split("/").filter(Boolean);
      const first = normalizeHandle(parts[0] || "");
      if (first && isValidHandle(first) && !["reel", "reels", "p", "tv"].includes(first)) {
        return { platform: "instagram", handle: first, url: profileUrl(first), pageType: "profile" };
      }
      if (["reel", "reels", "p", "tv"].includes(first)) {
        return {
          platform: "instagram",
          handle: null,
          url: null,
          pageType: first === "p" || first === "tv" ? "post" : "reel",
          shortcode: parts[1] || null,
        };
      }
      return { platform: "instagram", handle: null, url: null, pageType: "other" };
    } catch {
      return { platform: null, handle: null, url: null, pageType: "unknown" };
    }
  }

  function handleFromHref(href) {
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
    let path = href;
    try {
      if (/^https?:/i.test(href)) {
        const u = new URL(href);
        if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, ""))) return null;
        path = u.pathname;
      }
    } catch {
      /* relativo */
    }
    path = path.split("?")[0].split("#")[0];
    const m = path.match(/^\/([A-Za-z0-9._]{2,30})(?:\/(?:reels|feed|tagged|saved|channel))?\/?$/i);
    if (!m) return null;
    const handle = normalizeHandle(m[1]);
    return isValidHandle(handle) ? handle : null;
  }

  function findActiveVideo(doc) {
    const root = doc || document;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const mid = vh / 2;
    const videos = [...root.querySelectorAll("main video, section video, article video, video")];
    let best = null;
    let bestScore = -1;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      if (r.width < 40 || r.height < 60) continue;
      const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (vis < 30) continue;
      const center = 1 - Math.min(1, Math.abs((r.top + r.bottom) / 2 - mid) / (vh / 2));
      let score = vis * (0.45 + 0.55 * center);
      try {
        if (!v.paused && !v.ended) score += 3000;
        if (typeof v.currentTime === "number" && v.currentTime > 0) score += 100;
      } catch {
        /* ignore */
      }
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    return best;
  }

  /** Autor do reel: link de perfil mais proximo do video ativo. */
  function detectAuthorFromDom(doc) {
    const root = doc || document;
    const video = findActiveVideo(root);
    if (!video) return null;
    const vr = video.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const ax = vr.left + Math.min(180, vr.width * 0.3);
    const ay = vr.bottom - Math.min(100, vr.height * 0.18);
    let best = null;
    let bestScore = -1;
    root.querySelectorAll("a[href]").forEach((a) => {
      const handle = handleFromHref(a.getAttribute("href") || "");
      if (!handle) return;
      const r = a.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) return;
      if (r.left < 60) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cy < 0 || cy > vh || cx < 0 || cx > vw) return;
      const dist = Math.hypot(cx - ax, cy - ay);
      const txt = (a.textContent || "").trim().toLowerCase().replace(/^@/, "");
      let score = Math.max(0, 120 - dist / 5);
      if (txt === handle) score += 90;
      else if (a.querySelector("img")) score += 30;
      if (score > bestScore) {
        bestScore = score;
        best = handle;
      }
    });
    if (!best || bestScore < 40) return null;
    return { platform: "instagram", handle: best, url: profileUrl(best), pageType: "reel" };
  }

  function detectCurrentPage(href, doc) {
    const base = detectFromUrl(href || (typeof location !== "undefined" ? location.href : ""));
    if (base.platform === "instagram" && base.handle && base.pageType === "profile") return base;
    if (base.platform === "instagram" && (base.pageType === "reel" || base.pageType === "post")) {
      return detectAuthorFromDom(doc) || base;
    }
    return base;
  }

  global.EozDetect = {
    normalizeHandle,
    isValidHandle,
    detectFromUrl,
    detectAuthorFromDom,
    detectCurrentPage,
    profileUrl,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
