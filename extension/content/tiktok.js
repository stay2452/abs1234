/* global BdpDetect, BdpContent */

(function () {
  const BTN_ID = "bdp-tt-tracker-btn";
  const SLOT_ID = "bdp-tt-tracker-slot";

  function cleanup() {
    document
      .querySelectorAll(
        `#${BTN_ID}, #${SLOT_ID}, #bdp-tt-btn, #bdp-tt-float, .bdp-profile-slot, .bdp-reel-slot`,
      )
      .forEach((el) => {
        if (el.id === BTN_ID || el.id === SLOT_ID || el.id === "bdp-tt-btn" || el.id === "bdp-tt-float") {
          el.remove();
        } else if (el.querySelector?.(`#${BTN_ID}, #bdp-tt-btn`)) {
          el.remove();
        }
      });
    // remove slots vazios da extensão
    document.querySelectorAll(".bdp-profile-slot, .bdp-reel-slot").forEach((el) => {
      if (!el.querySelector("button")) el.remove();
    });
  }

  function getButton() {
    let btn = document.getElementById(BTN_ID);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.className = "bdp-btn";
    btn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const d = BdpDetect.detectCurrentPage(location.href, document);
        void BdpContent.runImportClick(btn, d, {
          icon: btn.classList.contains("bdp-btn-icon"),
        });
      },
      true,
    );
    return btn;
  }

  function styleProfile(btn, handle) {
    btn.className = "bdp-btn";
    btn.dataset.idleLabel = "+ Tracker";
    btn.dataset.idleTitle = `Importar @${handle} no tracker`;
    if (!btn.classList.contains("is-ok") && !btn.classList.contains("is-err") && !btn.disabled) {
      btn.textContent = "+ Tracker";
    }
    btn.title = btn.dataset.idleTitle;
    btn.style.right = "";
    btn.style.top = "";
  }

  function styleVideo(btn, handle) {
    btn.className = "bdp-btn bdp-btn-icon bdp-reel-vertical";
    btn.dataset.idleLabel = "+";
    btn.dataset.idleTitle = `Importar @${handle} no tracker`;
    if (!btn.classList.contains("is-ok") && !btn.classList.contains("is-err") && !btn.disabled) {
      btn.textContent = "+";
    }
    btn.title = btn.dataset.idleTitle;
    btn.style.right = "";
    btn.style.top = "";
  }

  function mount() {
    const detected = BdpDetect.detectCurrentPage(location.href, document);
    if (detected.platform !== "tiktok" || !detected.handle) {
      cleanup();
      return;
    }

    // um botão só
    document.querySelectorAll(".bdp-btn").forEach((el) => {
      if (el.id !== BTN_ID) el.remove();
    });

    const btn = getButton();

    if (detected.pageType === "profile") {
      styleProfile(btn, detected.handle);
      const follow =
        document.querySelector('[data-e2e="follow-button"]') ||
        document.querySelector('button[data-e2e*="follow"]');
      const parent = follow?.parentElement;
      if (parent) {
        let slot = parent.querySelector(`:scope > #${SLOT_ID}`);
        if (!slot) {
          slot = document.createElement("span");
          slot.id = SLOT_ID;
          slot.className = "bdp-profile-slot";
          parent.appendChild(slot);
        }
        slot.appendChild(btn);
        return;
      }
      btn.classList.add("bdp-float-profile");
      document.documentElement.appendChild(btn);
      return;
    }

    if (detected.pageType === "video") {
      styleVideo(btn, detected.handle);
      const actionBar =
        document.querySelector('[data-e2e="browse-action"]') ||
        document.querySelector('[class*="DivActionItemContainer"]');
      if (actionBar) {
        let slot = actionBar.querySelector(`:scope > #${SLOT_ID}`);
        if (!slot) {
          slot = document.createElement("div");
          slot.id = SLOT_ID;
          slot.className = "bdp-reel-slot";
          // acima do primeiro item se possível
          if (actionBar.firstChild) {
            actionBar.insertBefore(slot, actionBar.firstChild);
          } else {
            actionBar.appendChild(slot);
          }
        }
        slot.appendChild(btn);
        return;
      }
      btn.classList.add("bdp-float-reel");
      btn.style.right = "78px";
      btn.style.top = "22%";
      document.documentElement.appendChild(btn);
      return;
    }

    cleanup();
  }

  let mounting = false;

  function softSync() {
    if (mounting) return;
    mounting = true;
    try {
      const btn = document.getElementById(BTN_ID);
      // se já está bem colocado, não remonta (evita piscar)
      if (btn?.isConnected) {
        const detected = BdpDetect.detectCurrentPage(location.href, document);
        if (
          detected.platform === "tiktok" &&
          detected.handle &&
          (btn.closest(`#${SLOT_ID}`) ||
            btn.classList.contains("bdp-float-profile") ||
            btn.classList.contains("bdp-float-reel"))
        ) {
          if (btn.dataset.handle !== detected.handle) {
            btn.dataset.handle = detected.handle;
            btn.title = `Importar @${detected.handle} no tracker local`;
          }
          return;
        }
      }
      mount();
    } catch {
      /* ignore */
    } finally {
      mounting = false;
    }
  }

  const sync = BdpContent.throttle(softSync, 400);

  BdpContent.hookSpaNavigation(() => {
    setTimeout(softSync, 120);
    setTimeout(softSync, 500);
  });

  new MutationObserver((mutations) => {
    if (mounting) return;
    // ignora mutações só do nosso botão
    const onlyOurs = mutations.every((m) =>
      [...m.addedNodes, ...m.removedNodes].every(
        (n) =>
          n.nodeType !== 1 ||
          n.id === BTN_ID ||
          n.id === SLOT_ID ||
          n.classList?.contains("bdp-btn") ||
          n.classList?.contains("bdp-profile-slot") ||
          n.classList?.contains("bdp-reel-slot") ||
          n.closest?.(`#${BTN_ID}, #${SLOT_ID}`),
      ),
    );
    if (onlyOurs && mutations.some((m) => m.addedNodes.length || m.removedNodes.length)) {
      return;
    }
    sync();
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    if (!document.getElementById(BTN_ID)?.isConnected) softSync();
  }, 1500);

  mount();
  setTimeout(softSync, 800);
})();

