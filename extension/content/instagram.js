/* Eye of Zuck v2 — 1 botao no Instagram (perfil + reel). */
(function () {
  const BTN_ID = "eoz-ig-btn";
  const SLOT_ID = "eoz-ig-slot";
  const ACTION_RE = /seguir|seguindo|follow|following|mensagem|message/i;

  function pageKind() {
    const path = location.pathname || "";
    if (/^\/(reel|reels|p|tv)(\/|$)/i.test(path)) return "reel";
    const d = EozDetect.detectCurrentPage(location.href, document);
    if (d.pageType === "profile" && d.handle) return "profile";
    if (d.pageType === "reel" || d.pageType === "post") return "reel";
    return "other";
  }

  function detectTarget() {
    return EozDetect.detectCurrentPage(location.href, document);
  }

  function setTip(btn, text) {
    btn.setAttribute("data-tip", text || "");
    btn.setAttribute("aria-label", text || "");
    btn.title = text || "";
  }

  function getButton() {
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "eoz-btn";
    btn.textContent = "+ Tracker";
    setTip(btn, "Importar perfil no tracker");
    btn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        void runImport(btn);
      },
      true,
    );
    return btn;
  }

  async function runImport(btn) {
    const idle = btn.classList.contains("eoz-icon") ? "+" : "+ Tracker";
    btn.disabled = true;
    btn.classList.remove("is-ok", "is-err");
    btn.textContent = "…";
    let target = detectTarget();
    if (!target?.handle) {
      await new Promise((r) => setTimeout(r, 250));
      target = detectTarget();
    }
    if (!target?.handle || !target?.url) {
      btn.disabled = false;
      btn.classList.add("is-err");
      btn.textContent = btn.classList.contains("eoz-icon") ? "!" : "Sem @";
      setTip(btn, "Nao achei o @. Abra o perfil ou espere o reel carregar.");
      setTimeout(() => {
        btn.classList.remove("is-err");
        btn.textContent = idle;
        setTip(btn, "Importar no tracker");
      }, 3200);
      return;
    }
    setTip(btn, `Importando @${target.handle}…`);
    try {
      const res = await chrome.runtime.sendMessage({
        action: "import",
        text: target.url,
        handle: target.handle,
        platform: "instagram",
      });
      if (!res?.ok) throw new Error(res?.error || "Falha ao importar.");
      btn.disabled = false;
      btn.classList.add("is-ok");
      btn.textContent = btn.classList.contains("eoz-icon") ? "✓" : "No tracker ✓";
      setTip(btn, res.message || `@${target.handle} no tracker`);
      if (btn.classList.contains("eoz-icon")) {
        setTimeout(() => {
          if (!btn.isConnected) return;
          btn.classList.remove("is-ok");
          btn.textContent = "+";
          setTip(btn, `Importar @${target.handle} no tracker`);
        }, 2200);
      }
    } catch (err) {
      btn.disabled = false;
      btn.classList.add("is-err");
      btn.textContent = btn.classList.contains("eoz-icon") ? "!" : "Erro";
      setTip(btn, err instanceof Error ? err.message : "Erro.");
      setTimeout(() => {
        btn.classList.remove("is-err");
        btn.textContent = idle;
      }, 4000);
    }
  }

  function findProfileRow() {
    const all = [...document.querySelectorAll("header button, main header button, section button")];
    const anchor = all.find((el) =>
      ACTION_RE.test((el.textContent || el.getAttribute("aria-label") || "").trim()),
    );
    if (!anchor) return null;
    let node = anchor.parentElement;
    for (let d = 0; d < 6 && node; d++) {
      const r = node.getBoundingClientRect();
      if (r.width >= 160 && r.top > 80) return node;
      node = node.parentElement;
    }
    return anchor.parentElement;
  }

  function findReelBar() {
    const sels = ['svg[aria-label*="Curtir" i]', 'svg[aria-label*="Like" i]', 'svg[aria-label*="Comentar" i]', 'svg[aria-label*="Comment" i]'];
    for (const sel of sels) {
      const svg = document.querySelector(sel);
      const btn = svg?.closest("button, div[role='button']");
      if (btn?.isConnected) {
        const r = btn.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          let node = btn.parentElement;
          for (let d = 0; d < 10 && node && node !== document.body; d++) {
            const kids = [...node.children].filter((c) => c.querySelector?.("svg"));
            if (kids.length >= 3) return node;
            node = node.parentElement;
          }
          return btn.parentElement;
        }
      }
    }
    return null;
  }

  function sync() {
    const kind = pageKind();
    const old = document.getElementById(BTN_ID);
    if (kind === "other") {
      old?.remove();
      document.getElementById(SLOT_ID)?.remove();
      return;
    }
    const btn = getButton();
    const target = detectTarget();

    if (kind === "profile") {
      btn.classList.remove("eoz-icon", "eoz-float-profile", "eoz-float-reel");
      if (!btn.classList.contains("is-ok") && !btn.classList.contains("is-err")) {
        btn.textContent = "+ Tracker";
      }
      setTip(btn, target?.handle ? `Importar @${target.handle} no tracker` : "Importar perfil no tracker");
      const row = findProfileRow();
      if (row) {
        let slot = row.querySelector(`:scope > #${SLOT_ID}`);
        if (!slot) {
          slot = document.createElement("span");
          slot.id = SLOT_ID;
          slot.className = "eoz-profile-slot";
          row.appendChild(slot);
        }
        if (btn.parentElement !== slot) slot.appendChild(btn);
      } else if (btn.parentElement !== document.documentElement) {
        btn.classList.add("eoz-float-profile");
        document.documentElement.appendChild(btn);
      }
      return;
    }

    // reel
    btn.classList.add("eoz-icon");
    btn.classList.remove("eoz-float-profile");
    if (!btn.classList.contains("is-ok") && !btn.classList.contains("is-err") && btn.textContent !== "…") {
      btn.textContent = "+";
    }
    if (target?.handle) {
      btn.dataset.handle = target.handle;
      if (!btn.classList.contains("is-ok") && !btn.classList.contains("is-err")) {
        setTip(btn, `Importar @${target.handle} no tracker`);
      }
    }
    const bar = findReelBar();
    if (bar) {
      btn.classList.remove("eoz-float-reel");
      let slot = bar.querySelector(`:scope > #${SLOT_ID}`);
      if (!slot) {
        slot = document.createElement("div");
        slot.id = SLOT_ID;
        slot.className = "eoz-reel-slot";
        bar.insertBefore(slot, bar.firstChild);
      }
      if (btn.parentElement !== slot) slot.appendChild(btn);
    } else if (btn.parentElement !== document.documentElement) {
      btn.classList.add("eoz-float-reel");
      document.documentElement.appendChild(btn);
    }
  }

  function throttle(fn, ms) {
    let t = null;
    return (...args) => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        fn(...args);
      }, ms);
    };
  }

  const push = history.pushState;
  history.pushState = function (...args) {
    push.apply(this, args);
    setTimeout(sync, 120);
  };
  const replace = history.replaceState;
  history.replaceState = function (...args) {
    replace.apply(this, args);
    setTimeout(sync, 120);
  };
  window.addEventListener("popstate", () => setTimeout(sync, 120));

  const throttled = throttle(sync, 400);
  new MutationObserver(() => throttled).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.action !== "eoz-detect") return false;
    try {
      sendResponse({ ok: true, detected: detectTarget(), href: location.href });
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : "detect fail" });
    }
    return true;
  });

  sync();
  setTimeout(sync, 500);
})();
