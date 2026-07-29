/**
 * Utilitários compartilhados IG + TikTok (content scripts).
 */
(function (global) {
  function sendImport(payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          { action: "import", scrape: false, ...payload },
          (res) => {
            const err = chrome.runtime.lastError;
            if (err) {
              const msg = err.message || "Falha na extensão";
              reject(
                new Error(
                  msg.includes("Extension context invalidated")
                    ? "Recarregue a extensão e a página (F5)."
                    : msg,
                ),
              );
              return;
            }
            resolve(res);
          },
        );
      } catch (e) {
        reject(
          e instanceof Error
            ? e
            : new Error("Recarregue a extensão e a página (F5)."),
        );
      }
    });
  }

  /** title nativo do IG some; usamos data-tip + aria-label (CSS mostra no hover). */
  function setTip(btn, text) {
    if (!btn) return;
    const t = text || "";
    btn.setAttribute("data-tip", t);
    btn.setAttribute("aria-label", t);
    btn.title = t; // fallback
  }

  function setButtonState(btn, state, label) {
    if (!btn) return;
    btn.disabled = state === "loading";
    btn.classList.remove("is-ok", "is-err");
    if (state === "ok") btn.classList.add("is-ok");
    if (state === "err") btn.classList.add("is-err");
    if (label != null) btn.textContent = label;
  }

  function resetErrorLater(btn, idleLabel, idleTitle, ms) {
    setTimeout(() => {
      if (!btn?.classList.contains("is-err")) return;
      setButtonState(btn, "idle", idleLabel);
      setTip(btn, idleTitle || "Importar para o tracker");
    }, ms || 3200);
  }

  function resolveIgTarget(target) {
    const api = global.BdpDetect;
    let handle = target?.handle ? String(target.handle) : null;
    let url = target?.url || null;
    let platform = target?.platform || "instagram";

    if (handle && api?.normalizeHandle) {
      handle = api.normalizeHandle(handle);
    }

    if (handle && platform === "instagram" && api?.isValidIgHandle) {
      if (!api.isValidIgHandle(handle)) {
        handle = null;
        url = null;
      }
    }

    if (!handle && api?.detectInstagramAuthorFromDom && platform !== "tiktok") {
      const author = api.detectInstagramAuthorFromDom(document);
      if (author?.handle) {
        handle = author.handle;
        url = author.url;
        platform = "instagram";
      }
    }

    if (!handle && api?.detectCurrentPage) {
      const live = api.detectCurrentPage(location.href, document);
      if (live?.handle) {
        handle = live.handle;
        url = live.url || url;
        platform = live.platform || platform;
      }
    }

    if (!url && handle) {
      url =
        platform === "tiktok"
          ? `https://www.tiktok.com/@${handle}`
          : `https://www.instagram.com/${handle}/`;
    }

    return { handle, url, platform };
  }

  async function runImportClick(btn, target, opts) {
    const isIcon = Boolean(opts?.icon || btn.classList.contains("bdp-btn-icon"));
    const idle = btn.dataset.idleLabel || (isIcon ? "+" : "+ Tracker");
    const idleTitle = btn.dataset.idleTitle || "Importar para o tracker";

    setButtonState(btn, "loading", "…");
    setTip(btn, "Detectando @…");

    let resolved = resolveIgTarget(target);

    if (!resolved.handle) {
      await new Promise((r) => setTimeout(r, 200));
      resolved = resolveIgTarget(target);
    }

    if (!resolved.handle && btn.dataset.handle) {
      const h = global.BdpDetect?.normalizeHandle
        ? global.BdpDetect.normalizeHandle(btn.dataset.handle)
        : String(btn.dataset.handle).toLowerCase();
      if (!global.BdpDetect?.isValidIgHandle || global.BdpDetect.isValidIgHandle(h)) {
        resolved = {
          handle: h,
          url: `https://www.instagram.com/${h}/`,
          platform: "instagram",
        };
      }
    }

    const { handle, url, platform } = resolved;

    if (!handle || !url) {
      setButtonState(btn, "err", isIcon ? "!" : "Sem @");
      setTip(
        btn,
        "Não achei o @ do autor. Espere 1s e clique de novo, ou abra o perfil.",
      );
      resetErrorLater(btn, idle, idleTitle);
      return;
    }

    btn.dataset.handle = handle;
    setTip(btn, `Importando @${handle}…`);

    try {
      const result = await sendImport({
        text: url,
        handle,
        platform,
      });

      if (!result?.ok) {
        const msg = result?.error || "Falha ao importar";
        setButtonState(
          btn,
          "err",
          isIcon ? "!" : result?.offline ? "App off" : "Erro",
        );
        setTip(btn, msg);
        resetErrorLater(btn, idle, `Importar @${handle} no tracker`, 4000);
        return;
      }

      const okLabel = isIcon
        ? "✓"
        : (result.created || 0) > 0
          ? "No tracker ✓"
          : "Atualizado ✓";
      setButtonState(btn, "ok", okLabel);
      setTip(btn, result.message || `@${handle} no tracker`);

      if (isIcon) {
        setTimeout(() => {
          if (!btn.isConnected) return;
          setButtonState(btn, "idle", idle);
          setTip(btn, `Importar @${handle} no tracker`);
        }, 2200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      setButtonState(btn, "err", isIcon ? "!" : "Erro");
      setTip(btn, msg);
      resetErrorLater(btn, idle, idleTitle, 4000);
    }
  }

  function hookSpaNavigation(onNav) {
    const pushState = history.pushState;
    history.pushState = function (...args) {
      pushState.apply(this, args);
      onNav();
    };
    const replaceState = history.replaceState;
    history.replaceState = function (...args) {
      replaceState.apply(this, args);
      onNav();
    };
    window.addEventListener("popstate", onNav);
  }

  function throttle(fn, ms) {
    let t = null;
    return function throttled(...args) {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        fn(...args);
      }, ms);
    };
  }

  try {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.action !== "bdp-detect") return false;
      try {
        const api = global.BdpDetect;
        let detected = api?.detectCurrentPage
          ? api.detectCurrentPage(location.href, document)
          : null;
        if (
          !detected?.handle &&
          api?.detectInstagramAuthorFromDom &&
          (detected?.pageType === "reel" ||
            detected?.pageType === "post" ||
            /^\/(reel|reels|p|tv)(\/|$)/i.test(location.pathname || ""))
        ) {
          const author = api.detectInstagramAuthorFromDom(document);
          if (author?.handle) detected = author;
        }
        sendResponse({ ok: true, detected, href: location.href });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "detect fail",
        });
      }
      return true;
    });
  } catch {
    /* ignore */
  }

  global.BdpContent = {
    sendImport,
    setButtonState,
    setTip,
    resetErrorLater,
    runImportClick,
    resolveIgTarget,
    hookSpaNavigation,
    throttle,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
