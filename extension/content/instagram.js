/* global BdpDetect, BdpContent */

/**
 * Instagram — um botão, reancoragem agressiva em reels.
 * Problema clássico: no swipe o IG troca a coluna de ações; o + fica no reel antigo.
 * Solução: só ancora em barra VISÍVEL + re-sync rápido em scroll/tecla/mutation.
 */
(function () {
  const BTN_ID = "bdp-ig-tracker-btn";
  const SLOT_ID = "bdp-ig-tracker-slot";
  const ACTION_RE =
    /seguir|seguindo|follow|following|mensagem|message|enviar mensagem/i;

  let mounting = false;
  let lastKind = "";
  let lastPath = "";
  let lastReelKey = "";
  let lastHostBar = null;

  function textOf(el) {
    return (el?.textContent || el?.getAttribute?.("aria-label") || "").trim();
  }

  /** reel/post real no path raiz — não /username/reels/ */
  function isStandaloneMediaPath(path) {
    return /^\/(reel|reels|p|tv)(\/|$)/i.test(path || "");
  }

  function pageKind() {
    const path = location.pathname || "";
    if (isStandaloneMediaPath(path)) return "reel";
    const d = BdpDetect.detectCurrentPage(location.href, document);
    if (d.pageType === "profile" && d.handle) return "profile";
    if (d.pageType === "reel" || d.pageType === "post") return "reel";
    return "other";
  }

  function detectTarget() {
    const kind = pageKind();
    if (kind === "profile") {
      const d = BdpDetect.detectCurrentPage(location.href, document);
      if (d?.handle) return d;
      const m = (location.pathname || "").match(/^\/([A-Za-z0-9._]+)/);
      const h = m ? BdpDetect.normalizeHandle(m[1]) : null;
      if (h && BdpDetect.isValidIgHandle(h)) {
        return {
          platform: "instagram",
          handle: h,
          url: `https://www.instagram.com/${h}/`,
          pageType: "profile",
        };
      }
      return { platform: "instagram", handle: null, url: null, pageType: "profile" };
    }
    if (kind === "reel") {
      const author = BdpDetect.detectInstagramAuthorFromDom(document);
      if (author?.handle) return author;
      const d = BdpDetect.detectCurrentPage(location.href, document);
      if (d?.handle) return d;
      return { platform: "instagram", handle: null, url: null, pageType: "reel" };
    }
    return BdpDetect.detectCurrentPage(location.href, document);
  }

  /** Chave do reel ativo (muda no swipe mesmo se a URL for só /reels/) */
  function currentReelKey() {
    const path = location.pathname || "";
    const m = path.match(/^\/(reel|reels|p|tv)\/([^/?#]+)/i);
    if (m) return `url:${m[2]}`;

    // vídeo mais central / visível
    const videos = [...document.querySelectorAll("main video, section video, video")];
    let best = null;
    let bestVis = 0;
    const vh = window.innerHeight;
    const mid = vh / 2;
    for (const v of videos) {
      const r = v.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) continue;
      const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      const centerBonus = 1 - Math.min(1, Math.abs((r.top + r.bottom) / 2 - mid) / vh);
      const score = vis * (0.6 + 0.4 * centerBonus);
      if (score > bestVis) {
        bestVis = score;
        best = v;
      }
    }
    if (best) {
      const src = best.currentSrc || best.src || "";
      if (src) return `vid:${src.slice(-64)}`;
      // fallback: posição no DOM
      return `vid-idx:${videos.indexOf(best)}`;
    }
    return `path:${path}`;
  }

  function visibleScore(rect, vw, vh) {
    const visH = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
    const visW = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
    if (visH < 40 || visW < 12) return 0;
    const midY = (rect.top + rect.bottom) / 2;
    const center = 1 - Math.min(1, Math.abs(midY - vh / 2) / (vh / 2));
    return visH * 0.5 + visW * 0.2 + center * 120;
  }

  function isInViewport(el, minPx) {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    return visH >= (minPx || 12) && visW >= (minPx || 12) && r.width > 0 && r.height > 0;
  }

  function findReelActionBar() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const svgSelectors = [
      'svg[aria-label*="Curtir" i]',
      'svg[aria-label*="Like" i]',
      'svg[aria-label*="Descurtir" i]',
      'svg[aria-label*="Unlike" i]',
      'svg[aria-label*="Comentar" i]',
      'svg[aria-label*="Comment" i]',
      'svg[aria-label*="Compartilhar" i]',
      'svg[aria-label*="Share" i]',
    ];

    const seeds = [];
    for (const sel of svgSelectors) {
      document.querySelectorAll(sel).forEach((svg) => {
        const btn = svg.closest("button, div[role='button'], [role='button']");
        if (!btn) return;
        // só seeds visíveis (evita coluna do reel antigo)
        if (!isInViewport(btn, 8)) return;
        seeds.push(btn);
      });
    }

    // fallback: botões com svg na metade direita da tela
    document
      .querySelectorAll("main button, main div[role='button'], section button, article button")
      .forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8 || rect.width > 90 || rect.height > 110) return;
        if (!btn.querySelector("svg") || rect.left < vw * 0.35) return;
        if (!isInViewport(btn, 8)) return;
        seeds.push(btn);
      });

    const scores = new Map();
    for (const btn of new Set(seeds)) {
      let node = btn.parentElement;
      for (let d = 0; d < 12 && node && node !== document.body; d++) {
        const rect = node.getBoundingClientRect();
        const vis = visibleScore(rect, vw, vh);
        if (vis < 30) {
          node = node.parentElement;
          continue;
        }
        // ignora sidebar esquerda
        if (rect.left < 90 && rect.width < 280) {
          node = node.parentElement;
          continue;
        }

        const kids = [...node.children].filter((ch) => {
          const r = ch.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && isInViewport(ch, 4);
        });
        const iconKids = kids.filter((ch) => {
          const r = ch.getBoundingClientRect();
          return ch.querySelector?.("svg") && r.width < 110 && r.height < 130;
        });

        const isColumn =
          iconKids.length >= 3 &&
          rect.height >= 120 &&
          rect.width <= 160 &&
          rect.left >= vw * 0.4;
        const isBar =
          iconKids.length >= 3 &&
          rect.height <= 120 &&
          rect.width >= 160 &&
          rect.bottom > vh * 0.3 &&
          rect.left > vw * 0.12;

        if (isColumn || isBar) {
          const layout = isColumn ? "vertical" : "horizontal";
          // visibilidade pesa mais que quantidade de ícones
          const score =
            vis * 2 +
            iconKids.length * 15 +
            (isColumn ? 80 : 50) +
            (rect.left > vw * 0.55 ? 30 : 0) +
            (rect.top > vh * 0.05 && rect.bottom < vh * 0.98 ? 40 : 0);
          const prev = scores.get(node);
          if (!prev || score > prev.score) scores.set(node, { score, layout, vis });
        }
        node = node.parentElement;
      }
    }

    let best = null;
    let bestMeta = null;
    for (const [el, meta] of scores) {
      if (!bestMeta || meta.score > bestMeta.score) {
        best = el;
        bestMeta = meta;
      }
    }
    // exige barra minimamente visível
    if (!best || !bestMeta || bestMeta.vis < 40) return null;
    return { el: best, layout: bestMeta.layout };
  }

  function isOurNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (
      node.id === BTN_ID ||
      node.id === SLOT_ID ||
      node.classList?.contains("bdp-btn") ||
      node.classList?.contains("bdp-reel-slot") ||
      node.classList?.contains("bdp-profile-slot")
    ) {
      return true;
    }
    return Boolean(
      node.closest?.(
        `#${BTN_ID}, #${SLOT_ID}, .bdp-btn, .bdp-reel-slot, .bdp-profile-slot`,
      ),
    );
  }

  function mutationsAreOnlyOurs(mutations) {
    let sawOurs = false;
    let sawForeign = false;
    for (const m of mutations) {
      for (const n of [...m.addedNodes, ...m.removedNodes]) {
        if (n.nodeType === 3) continue;
        if (isOurNode(n)) sawOurs = true;
        else if (n.nodeType === 1) sawForeign = true;
      }
      if (m.type === "attributes") {
        if (isOurNode(m.target)) sawOurs = true;
        else sawForeign = true;
      }
    }
    return sawOurs && !sawForeign;
  }

  function cleanupAll() {
    document
      .querySelectorAll(
        `#${BTN_ID}, #${SLOT_ID}, .bdp-reel-slot, .bdp-profile-slot, .bdp-float-reel, .bdp-float-profile, #bdp-ig-profile-btn, #bdp-ig-reel-btn, #bdp-ig-float-btn`,
      )
      .forEach((el) => el.remove());
    lastHostBar = null;
  }

  function getOrCreateButton() {
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "bdp-btn";
    btn.textContent = "+";
    btn.dataset.idleLabel = "+";
    btn.dataset.idleTitle = "Importar autor no tracker";
    if (BdpContent.setTip) {
      BdpContent.setTip(btn, "Importar autor no tracker");
    } else {
      btn.title = "Importar autor no tracker";
      btn.setAttribute("data-tip", "Importar autor no tracker");
    }
    btn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        const fresh = detectTarget();
        void BdpContent.runImportClick(btn, fresh, {
          icon: btn.classList.contains("bdp-btn-icon"),
        });
      },
      true,
    );
    return btn;
  }

  function applyProfileStyle(btn) {
    const ok = btn.classList.contains("is-ok");
    const err = btn.classList.contains("is-err");
    const dis = btn.disabled;
    btn.className = "bdp-btn";
    if (ok) btn.classList.add("is-ok");
    if (err) btn.classList.add("is-err");
    btn.disabled = dis;
    btn.dataset.idleLabel = "+ Tracker";
    btn.dataset.idleTitle = "Importar perfil no tracker";
    if (!ok && !err && !dis && btn.textContent !== "+ Tracker") {
      btn.textContent = "+ Tracker";
    }
    if (!ok && !err) btn.title = btn.dataset.idleTitle;
    btn.style.cssText = "";
  }

  function applyReelStyle(btn, layout, floating) {
    const horiz = layout === "horizontal";
    let ok = btn.classList.contains("is-ok");
    let err = btn.classList.contains("is-err");
    const loading = btn.disabled && btn.textContent === "…";

    const t = detectTarget();
    // novo autor ou saiu do erro → volta pro +
    if (t?.handle && (btn.dataset.handle !== t.handle || err)) {
      if (btn.dataset.handle !== t.handle) {
        ok = false;
        err = false;
        btn.classList.remove("is-ok", "is-err");
        btn.disabled = false;
      }
    }

    btn.classList.add("bdp-btn", "bdp-btn-icon");
    btn.classList.toggle("bdp-reel-horizontal", horiz && !floating);
    btn.classList.toggle("bdp-reel-vertical", !horiz || floating);
    btn.classList.toggle("bdp-float-reel", Boolean(floating));
    btn.classList.remove("bdp-float-profile");
    if (ok) btn.classList.add("is-ok");
    else btn.classList.remove("is-ok");
    if (err) btn.classList.add("is-err");
    else btn.classList.remove("is-err");
    if (!loading) btn.disabled = false;

    btn.dataset.idleLabel = "+";
    btn.dataset.idleTitle = "Importar autor no tracker";

    if (!ok && !err && !loading) {
      if (btn.textContent !== "+") btn.textContent = "+";
    }

    if (t?.handle) {
      btn.dataset.handle = t.handle;
      if (!ok && !err) {
        const tip = `Importar @${t.handle} no tracker`;
        if (BdpContent.setTip) BdpContent.setTip(btn, tip);
        else {
          btn.title = tip;
          btn.setAttribute("data-tip", tip);
        }
      }
    } else {
      delete btn.dataset.handle;
      if (!ok && !err) {
        const tip = "Importar autor no tracker";
        if (BdpContent.setTip) BdpContent.setTip(btn, tip);
        else {
          btn.title = tip;
          btn.setAttribute("data-tip", tip);
        }
      }
    }

    // não zerar style se float precisa de posição — float usa classe CSS
    if (!floating) btn.style.cssText = "";
  }

  function findProfileActionRow() {
    const candidates = [
      ...document.querySelectorAll("header button, header a[role='button']"),
      ...document.querySelectorAll("main header button, main header a[role='button']"),
      ...document.querySelectorAll("section button, section a[role='button']"),
    ];
    const anchors = candidates.filter((el) => ACTION_RE.test(textOf(el)));
    for (const anchor of anchors) {
      let node = anchor.parentElement;
      for (let depth = 0; depth < 6 && node; depth++) {
        const actions = [
          ...node.querySelectorAll(
            ":scope > button, :scope > a[role='button'], :scope > div > button, :scope > div > a[role='button']",
          ),
        ];
        const hits = actions.filter((el) => ACTION_RE.test(textOf(el)));
        if (hits.length >= 1 && actions.length <= 8) {
          const rect = node.getBoundingClientRect();
          if (rect.width >= 160 && rect.top > 80 && rect.top < window.innerHeight * 0.75) {
            return node;
          }
        }
        node = node.parentElement;
      }
      if (anchor.parentElement) return anchor.parentElement;
    }
    return null;
  }

  function placeInSlot(parent, btn, slotClass, beforeEl) {
    // se o slot ficou em outro parent (reel antigo), recria
    let slot = parent.querySelector(`:scope > #${SLOT_ID}`);
    if (!slot) {
      // limpa slots órfãos no documento
      document.querySelectorAll(`#${SLOT_ID}`).forEach((el) => {
        if (el !== slot) el.remove();
      });
      slot = document.createElement(slotClass.includes("profile") ? "span" : "div");
      slot.id = SLOT_ID;
      slot.className = slotClass;
    } else {
      slot.className = slotClass;
    }

    if (beforeEl && beforeEl.parentElement === parent) {
      if (slot.nextSibling !== beforeEl || slot.parentElement !== parent) {
        parent.insertBefore(slot, beforeEl);
      }
    } else if (slot.parentElement !== parent) {
      parent.appendChild(slot);
    }
    if (btn.parentElement !== slot) {
      slot.appendChild(btn);
    }
  }

  function mountProfile(btn) {
    applyProfileStyle(btn);
    const row = findProfileActionRow();
    if (row) {
      placeInSlot(row, btn, "bdp-profile-slot");
      btn.classList.remove("bdp-float-profile");
      lastHostBar = row;
      return true;
    }
    btn.classList.add("bdp-float-profile");
    if (btn.parentElement !== document.documentElement) {
      document.documentElement.appendChild(btn);
    }
    lastHostBar = null;
    return true;
  }

  function mountReel(btn) {
    const bar = findReelActionBar();

    if (!bar) {
      // fallback fixo — sempre visível enquanto a coluna não existe
      applyReelStyle(btn, "vertical", true);
      if (btn.parentElement !== document.documentElement) {
        // tira de slot morto
        document.documentElement.appendChild(btn);
      }
      lastHostBar = null;
      return true;
    }

    // se a barra mudou (swipe), reseta feedback de import do reel anterior
    if (lastHostBar && lastHostBar !== bar.el) {
      btn.classList.remove("is-ok", "is-err");
      btn.disabled = false;
      btn.textContent = "+";
    }
    lastHostBar = bar.el;

    if (bar.layout === "horizontal") {
      applyReelStyle(btn, "horizontal", false);
      placeInSlot(bar.el, btn, "bdp-reel-slot bdp-reel-slot-horizontal");
      return true;
    }

    applyReelStyle(btn, "vertical", false);
    let likeChild = null;
    for (const child of bar.el.children) {
      if (child.id === SLOT_ID || child.classList?.contains("bdp-reel-slot")) continue;
      const isLike =
        child.querySelector?.('svg[aria-label*="Curtir" i]') ||
        child.querySelector?.('svg[aria-label*="Like" i]') ||
        child.querySelector?.('svg[aria-label*="Descurtir" i]') ||
        child.querySelector?.('svg[aria-label*="Unlike" i]');
      if (isLike) {
        likeChild = child;
        break;
      }
      if (!likeChild && child.querySelector?.("svg")) likeChild = child;
    }
    placeInSlot(bar.el, btn, "bdp-reel-slot", likeChild);
    return true;
  }

  function isHealthy(kind, btn) {
    if (!btn?.isConnected) return false;
    if (document.querySelectorAll(`#${BTN_ID}`).length !== 1) return false;
    if (document.querySelectorAll(".bdp-btn").length > 1) return false;

    if (kind === "profile") {
      return Boolean(
        btn.closest(`#${SLOT_ID}.bdp-profile-slot, .bdp-profile-slot`) ||
          btn.classList.contains("bdp-float-profile"),
      );
    }

    if (kind === "reel") {
      // precisa estar visível — senão está no reel antigo off-screen
      if (!isInViewport(btn, 8)) return false;

      const bar = findReelActionBar();
      if (bar?.el) {
        // saudável só se está DENTRO da barra ativa atual
        return bar.el.contains(btn);
      }
      // sem barra: float ok se visível
      return btn.classList.contains("bdp-float-reel");
    }
    return false;
  }

  function sync(force) {
    if (mounting) return;
    mounting = true;
    try {
      const kind = pageKind();
      const path = location.pathname || "";
      const reelKey = kind === "reel" ? currentReelKey() : "";
      const reelChanged = kind === "reel" && reelKey && reelKey !== lastReelKey;
      const pageChanged =
        force || kind !== lastKind || path !== lastPath || reelChanged;

      if (kind === "other") {
        if (document.getElementById(BTN_ID)) cleanupAll();
        lastKind = kind;
        lastPath = path;
        lastReelKey = "";
        return;
      }

      let btn = document.getElementById(BTN_ID);

      // limpa só ao trocar perfil ↔ reel
      if (pageChanged && lastKind && lastKind !== kind) {
        cleanupAll();
        btn = null;
      }

      // swipe de reel: limpa estado "ok" e @ antigo (evita importar o criador anterior)
      if (reelChanged && btn) {
        btn.classList.remove("is-ok", "is-err");
        btn.disabled = false;
        delete btn.dataset.handle;
        if (btn.classList.contains("bdp-btn-icon")) {
          btn.textContent = "+";
          if (BdpContent.setTip) {
            BdpContent.setTip(btn, "Importar autor no tracker");
          } else {
            btn.title = "Importar autor no tracker";
            btn.setAttribute("data-tip", "Importar autor no tracker");
          }
        }
      }

      // remove duplicatas
      document.querySelectorAll(".bdp-btn").forEach((el) => {
        if (el.id !== BTN_ID) el.remove();
      });
      // slots órfãos sem o botão
      document.querySelectorAll(`#${SLOT_ID}`).forEach((slot) => {
        if (!slot.querySelector(`#${BTN_ID}`) && !slot.contains(btn)) {
          // se o btn não está neste slot, remove lixo
          if (!btn || !slot.contains(btn)) slot.remove();
        }
      });

      if (!btn) {
        btn = getOrCreateButton();
        if (kind === "profile") mountProfile(btn);
        else mountReel(btn);
      } else if (!isHealthy(kind, btn) || pageChanged || reelChanged) {
        if (kind === "profile") mountProfile(btn);
        else mountReel(btn);
      } else if (kind === "reel") {
        // re-detecta autor a cada sync (scroll) — não gruda no @ antigo
        const t = detectTarget();
        if (t?.handle) {
          if (btn.dataset.handle !== t.handle) {
            btn.classList.remove("is-ok", "is-err");
            btn.disabled = false;
            if (btn.classList.contains("bdp-btn-icon")) btn.textContent = "+";
          }
          btn.dataset.handle = t.handle;
          if (!btn.classList.contains("is-ok") && !btn.classList.contains("is-err")) {
            const tip = `Importar @${t.handle} no tracker`;
            if (BdpContent.setTip) BdpContent.setTip(btn, tip);
            else {
              btn.title = tip;
              btn.setAttribute("data-tip", tip);
            }
          }
        } else {
          delete btn.dataset.handle;
          if (!btn.classList.contains("is-ok") && !btn.classList.contains("is-err")) {
            if (BdpContent.setTip) {
              BdpContent.setTip(btn, "Importar autor no tracker");
            } else {
              btn.title = "Importar autor no tracker";
              btn.setAttribute("data-tip", "Importar autor no tracker");
            }
          }
        }
      }

      lastKind = kind;
      lastPath = path;
      lastReelKey = reelKey;
    } catch {
      /* ignore */
    } finally {
      mounting = false;
    }
  }

  // —— listeners ——
  BdpContent.hookSpaNavigation(() => {
    setTimeout(() => sync(true), 50);
    setTimeout(() => sync(true), 250);
    setTimeout(() => sync(false), 700);
  });

  const onMut = (mutations) => {
    if (mounting) return;
    if (mutations && mutationsAreOnlyOurs(mutations)) return;
    if (onMut._t) return;
    onMut._t = setTimeout(() => {
      onMut._t = null;
      sync(false);
    }, 120);
  };

  new MutationObserver(onMut).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // scroll/swipe: SEMPRE tenta reancorar em reels (bar muda o tempo todo)
  const onGesture = BdpContent.throttle(() => {
    if (pageKind() !== "reel") return;
    sync(false);
  }, 100);
  window.addEventListener("wheel", onGesture, { passive: true, capture: true });
  window.addEventListener("scroll", onGesture, { passive: true, capture: true });
  window.addEventListener("touchend", onGesture, { passive: true, capture: true });
  window.addEventListener(
    "keydown",
    (e) => {
      if (pageKind() !== "reel") return;
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " "].includes(e.key)) {
        setTimeout(() => sync(true), 80);
        setTimeout(() => sync(false), 300);
      }
    },
    true,
  );

  // heartbeat rápido só em reels (recuperação se o IG engolir o botão)
  setInterval(() => {
    if (mounting) return;
    const kind = pageKind();
    if (kind === "other") return;
    const btn = document.getElementById(BTN_ID);
    if (kind === "reel") {
      const key = currentReelKey();
      if (!btn || !isHealthy("reel", btn) || key !== lastReelKey) {
        sync(true);
      }
      return;
    }
    if (!isHealthy(kind, btn)) sync(false);
  }, 350);

  sync(true);
  setTimeout(() => sync(false), 400);
  setTimeout(() => sync(false), 1000);
})();
