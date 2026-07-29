/**
 * Detecção de plataforma/handle — espelha regras de src/lib/profile-url.ts
 *
 * Reels: 1) linha do botão Seguir (layout real do IG)
 *        2) faixa do <video> ativo
 *        3) links visíveis com texto = @
 */
(function (global) {
  const INSTAGRAM_RESERVED = new Set([
    "about",
    "accounts",
    "api",
    "blog",
    "challenge",
    "create",
    "developer",
    "direct",
    "directory",
    "emails",
    "explore",
    "graphql",
    "help",
    "legal",
    "lite",
    "locations",
    "nametag",
    "p",
    "popular",
    "press",
    "privacy",
    "reel",
    "reels",
    "session",
    "static",
    "stories",
    "tags",
    "tv",
    "web",
    "your_activity",
    "youractivity",
    "settings",
    "support",
    "terms",
    "safety",
    "community",
    "features",
    "download",
    "meta",
  ]);

  function normalizeHandle(handle) {
    return String(handle || "")
      .replace(/^@/, "")
      .replace(/\/+$/, "")
      .trim()
      .toLowerCase();
  }

  function isValidIgHandle(handle) {
    if (!handle || handle.length < 2 || handle.length > 30) return false;
    if (INSTAGRAM_RESERVED.has(handle)) return false;
    return /^[a-z0-9._]+$/.test(handle);
  }

  function detectFromUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.replace(/^www\./, "").toLowerCase();
      const parts = url.pathname.split("/").filter(Boolean);

      if (host === "instagram.com") {
        const first = normalizeHandle(parts[0] || "");
        if (first && isValidIgHandle(first)) {
          if (!["reel", "reels", "p", "tv"].includes(first)) {
            return {
              platform: "instagram",
              handle: first,
              url: `https://www.instagram.com/${first}/`,
              pageType: "profile",
            };
          }
        }
        if (first === "reel" || first === "reels" || first === "p" || first === "tv") {
          return {
            platform: "instagram",
            handle: null,
            url: null,
            pageType: first === "p" || first === "tv" ? "post" : "reel",
            shortcode: parts[1] || null,
          };
        }
        return { platform: "instagram", handle: null, url: null, pageType: "other" };
      }

      if (host === "tiktok.com") {
        const at = parts.find((p) => p.startsWith("@"));
        const handle = normalizeHandle(at || "");
        if (!handle) {
          return { platform: "tiktok", handle: null, url: null, pageType: "other" };
        }
        const isVideo = parts.includes("video");
        return {
          platform: "tiktok",
          handle,
          url: `https://www.tiktok.com/@${handle}`,
          pageType: isVideo ? "video" : "profile",
        };
      }

      return { platform: null, handle: null, url: null, pageType: "unknown" };
    } catch {
      return { platform: null, handle: null, url: null, pageType: "unknown" };
    }
  }

  function extractHandleFromHref(href) {
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return null;
    let path = href;
    try {
      if (/^https?:/i.test(href)) {
        const u = new URL(href);
        if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, ""))) return null;
        path = u.pathname;
      }
    } catch {
      /* relative */
    }
    // remove query/hash already via pathname; relative may include ?x
    path = path.split("?")[0].split("#")[0];
    const m = path.match(
      /^\/([A-Za-z0-9._]{2,30})(?:\/(?:reels|feed|tagged|saved|channel|followers|following)?)?\/?$/i,
    );
    if (!m) return null;
    const handle = normalizeHandle(m[1]);
    if (!isValidIgHandle(handle)) return null;
    return handle;
  }

  function isVisibleEl(el, minPx) {
    if (!el?.getBoundingClientRect) return true;
    const r = el.getBoundingClientRect();
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    return visH >= (minPx || 3) && visW >= (minPx || 2) && r.width > 0 && r.height > 0;
  }

  function isFollowishText(text) {
    const t = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    // texto puro OU começa com a palavra (IG às vezes mete ícone)
    return /^(seguir|follow|seguindo|following)\b/i.test(t) && t.length < 24;
  }

  function findActiveReelVideo(root) {
    const doc = root || document;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const mid = vh / 2;
    const videos = [...doc.querySelectorAll("main video, section video, article video, video")];
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

  function result(handle, reelKey) {
    return {
      platform: "instagram",
      handle,
      url: `https://www.instagram.com/${handle}/`,
      pageType: "reel",
      reelKey: reelKey || "",
    };
  }

  /**
   * Estratégia principal: linha "avatar + @ + Seguir" (como no print do IG).
   */
  function detectFromFollowRow(root, vh, midY) {
    const scored = [];

    const candidates = root.querySelectorAll(
      "button, div[role='button'], a[role='button'], span, div, a",
    );

    for (const el of candidates) {
      const label = (el.textContent || el.getAttribute?.("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!isFollowishText(label)) continue;
      if (!isVisibleEl(el, 2)) continue;

      const r = el.getBoundingClientRect();
      // Seguir do reel: metade inferior, não na sidebar esquerda
      if (r.left < 72) continue;
      if (r.top < vh * 0.15 || r.top > vh * 0.98) continue;
      // preferir perto do meio vertical (reel ativo)
      const distMid = Math.abs((r.top + r.bottom) / 2 - midY);

      // sobe a árvore e coleta links de perfil no mesmo bloco
      let node = el;
      for (let depth = 0; depth < 10 && node && node !== root; depth++) {
        const links = node.querySelectorAll?.("a[href]") || [];
        for (const a of links) {
          const handle = extractHandleFromHref(a.getAttribute("href") || "");
          if (!handle) continue;
          if (!isVisibleEl(a, 1) && a.getBoundingClientRect().width === 0) continue;

          const ar = a.getBoundingClientRect();
          if (ar.left < 60) continue;

          const txt = (a.textContent || "").trim().toLowerCase().replace(/^@/, "");
          let score = 150 - depth * 4 - distMid * 0.15;

          if (txt === handle || txt === `@${handle}`) score += 80;
          else if (txt && txt.length < 40 && txt.includes(handle)) score += 35;
          else if (a.querySelector("img")) score += 40; // avatar ao lado do Seguir
          else score += 15;

          // Seguir à direita do @ (layout típico)
          if (ar.left < r.left) score += 25;

          scored.push({ handle, score });
        }
        // para cedo se já achou bom no nível baixo
        if (scored.length && depth >= 2 && scored.some((s) => s.score >= 180)) break;
        node = node.parentElement;
      }
    }

    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[0].score >= 100 ? scored[0].handle : null;
  }

  /**
   * Fallback: links na faixa do vídeo ativo.
   */
  function detectFromVideoBand(root, video, vw, vh) {
    const vr = video?.getBoundingClientRect?.();
    const band = vr
      ? {
          top: Math.max(0, vr.top - 80),
          bottom: Math.min(vh, vr.bottom + 140),
          left: Math.max(50, vr.left - 50),
          right: Math.min(vw, vr.right + 140),
          ax: vr.left + Math.min(180, vr.width * 0.3),
          ay: vr.bottom - Math.min(100, vr.height * 0.18),
        }
      : {
          top: vh * 0.15,
          bottom: vh * 0.98,
          left: 70,
          right: vw * 0.85,
          ax: vw * 0.3,
          ay: vh * 0.75,
        };

    const scored = [];

    root.querySelectorAll("a[href]").forEach((a) => {
      const handle = extractHandleFromHref(a.getAttribute("href") || "");
      if (!handle) return;
      const rect = a.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return;
      if (rect.bottom < band.top || rect.top > band.bottom) return;
      if (rect.right < band.left || rect.left > band.right) return;
      if (rect.left < 60) return;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(cx - band.ax, cy - band.ay);
      const txt = (a.textContent || "").trim().toLowerCase().replace(/^@/, "");

      let score = 40 + Math.max(0, 100 - dist / 5);
      if (txt === handle || txt === `@${handle}`) score += 90;
      else if (txt && txt.includes(handle)) score += 40;
      else if (a.querySelector("img")) score += 25;
      else score += 10;

      scored.push({ handle, score });
    });

    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    return scored[0].score >= 45 ? scored[0].handle : null;
  }

  function detectInstagramAuthorFromDom(doc) {
    const root = doc || document;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const midY = vh / 2;
    const video = findActiveReelVideo(root);
    const reelKey = video
      ? String(video.currentSrc || video.src || "").slice(-56) ||
        `t${Math.round(video.currentTime || 0)}`
      : "";

    // 1) linha Seguir (mais confiável no layout do print)
    const fromFollow = detectFromFollowRow(root, vh, midY);
    if (fromFollow) return result(fromFollow, reelKey);

    // 2) faixa do vídeo
    const fromBand = detectFromVideoBand(root, video, vw, vh);
    if (fromBand) return result(fromBand, reelKey);

    // 3) qualquer link visível com texto exato = handle (metade inferior)
    let best = null;
    let bestScore = 0;
    root.querySelectorAll("a[href]").forEach((a) => {
      if (!isVisibleEl(a, 4)) return;
      const handle = extractHandleFromHref(a.getAttribute("href") || "");
      if (!handle) return;
      const rect = a.getBoundingClientRect();
      if (rect.left < 70 || rect.top < vh * 0.2) return;
      const txt = (a.textContent || "").trim().toLowerCase().replace(/^@/, "");
      if (txt !== handle && txt !== `@${handle}`) return;
      const score = 80 + Math.max(0, 40 - Math.abs(rect.top - vh * 0.7) / 10);
      if (score > bestScore) {
        bestScore = score;
        best = handle;
      }
    });
    if (best) return result(best, reelKey);

    return null;
  }

  function detectCurrentPage(locationHref, doc) {
    const href = locationHref || (typeof location !== "undefined" ? location.href : "");
    const base = detectFromUrl(href);

    if (base.platform === "instagram" && base.handle && base.pageType === "profile") {
      return base;
    }

    if (base.platform === "instagram" && (base.pageType === "reel" || base.pageType === "post")) {
      const author = detectInstagramAuthorFromDom(doc);
      if (author) return author;
      return base;
    }

    return base;
  }

  global.BdpDetect = {
    normalizeHandle,
    isValidIgHandle,
    detectFromUrl,
    extractHandleFromHref,
    detectInstagramAuthorFromDom,
    detectCurrentPage,
    findActiveReelVideo,
    INSTAGRAM_RESERVED,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
