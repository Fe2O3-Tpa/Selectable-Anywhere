// ==UserScript==
// @name         Selectable Anywhere
// @namespace    https://tampermonkey.net/
// @version      1.5.3
// @description  Safe-first selectable/copy unlocker (minimal interference)
// @match        *://*/*
// @run-at       document-start
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  "use strict";
  const DEBUG = false;

  const KEY_PREFIX = `enabled_${location.origin}`;
  const KEY_ENABLED = `${KEY_PREFIX}:enabled`;
  const KEY_UI_FOLDED = `${KEY_PREFIX}:uiFolded`;

  const DEFAULT_STATE = {
    enabled: true,
    uiFolded: false,
  };

  const state = {
    enabled: GM_getValue(KEY_ENABLED, DEFAULT_STATE.enabled),
    uiFolded: GM_getValue(KEY_UI_FOLDED, DEFAULT_STATE.uiFolded),
  };

  const EXCLUDE_SELECTOR = [
    "input",
    "textarea",
    "button",
    "select",
    "option",
    "canvas",
    "svg",
    "video",
    "audio",
    "[contenteditable='true']",
    "[contenteditable='']",
    "[data-sa-ui]",
  ].join(",");

  // 変更前のインライン user-select 値を保存する領域
  // Element -> { value: string, priority: string }
  const savedInlineUserSelect = new WeakMap();
  const trackedRefs = [];
  const TRACKED_REFS_COMPACT_THRESHOLD = 2000;
  const INITIAL_SCAN_LIMIT = 1500;

  let observer = null;
  let debounceTimer = null;
  const pendingNodes = new Set();

  function log(message) {
    if (!DEBUG) return;
    console.log(`[Selectable Anywhere] ${message}`);
  }

  function saveState() {
    GM_setValue(KEY_ENABLED, state.enabled);
    GM_setValue(KEY_UI_FOLDED, state.uiFolded);
  }

  function isInShadowDom(el) {
    if (!el || !el.getRootNode) return false;
    const root = el.getRootNode();
    return typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot;
  }

  function isEligible(el) {
    if (!(el instanceof Element)) return false;
    if (!document.documentElement || !document.documentElement.contains(el)) return false;
    if (isInShadowDom(el)) return false;
    if (el.matches(EXCLUDE_SELECTOR) || el.closest(EXCLUDE_SELECTOR)) return false;
    return true;
  }

  function getComputedUserSelect(el) {
    try {
      return getComputedStyle(el).userSelect;
    } catch (_) {
      return "";
    }
  }

  function trackElement(el) {
    if (trackedRefs.length >= TRACKED_REFS_COMPACT_THRESHOLD) {
      compactTrackedRefs();
    }
    trackedRefs.push(new WeakRef(el));
  }

  function compactTrackedRefs() {
    let write = 0;
    for (let read = 0; read < trackedRefs.length; read += 1) {
      const el = trackedRefs[read].deref();
      if (!el) continue;
      if (!savedInlineUserSelect.has(el)) continue;
      trackedRefs[write] = trackedRefs[read];
      write += 1;
    }
    trackedRefs.length = write;
  }

  function forEachTrackedElement(fn) {
    let write = 0;
    for (let read = 0; read < trackedRefs.length; read += 1) {
      const el = trackedRefs[read].deref();
      if (!el) continue;
      trackedRefs[write] = trackedRefs[read];
      write += 1;
      if (savedInlineUserSelect.has(el)) fn(el);
    }
    trackedRefs.length = write;
  }

  function saveInlineValueIfNeeded(el) {
    if (savedInlineUserSelect.has(el)) return;

    savedInlineUserSelect.set(el, {
      value: el.style.getPropertyValue("user-select"),
      priority: el.style.getPropertyPriority("user-select"),
    });
    trackElement(el);
  }

  function forceUserSelectText(el) {
    if (!isEligible(el)) return;
    saveInlineValueIfNeeded(el);
    el.style.setProperty("user-select", "text", "important");
  }

  function restoreInlineUserSelect(el) {
    const prev = savedInlineUserSelect.get(el);
    if (!prev || !el || !el.style) return;

    if (prev.value) {
      el.style.setProperty("user-select", prev.value, prev.priority || "");
    } else {
      el.style.removeProperty("user-select");
    }

    savedInlineUserSelect.delete(el);
  }

  function processElement(el) {
    if (!(el instanceof Element)) return;

    if (!isEligible(el)) {
      if (savedInlineUserSelect.has(el)) restoreInlineUserSelect(el);
      return;
    }

    const computed = getComputedUserSelect(el);
    if (computed === "none") {
      forceUserSelectText(el);
      return;
    }

    // Keep forced inline value while enabled to avoid force/restore thrash.
    // Restoring is handled when disabled (or when element becomes ineligible).
  }

  function enqueueSubtree(node) {
    if (!(node instanceof Element)) return;
    pendingNodes.add(node);
  }

  function flushPending() {
    debounceTimer = null;
    if (!state.enabled) {
      pendingNodes.clear();
      return;
    }

    const nodes = Array.from(pendingNodes);
    pendingNodes.clear();

    for (const root of nodes) {
      processElement(root);
    }
    compactTrackedRefs();
  }

  function scheduleFlush() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushPending, 50);
  }

  function startObserver() {
    if (observer) observer.disconnect();
    if (!state.enabled) return;

    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes") {
          enqueueSubtree(m.target);
          continue;
        }
        if (m.type === "childList") {
          for (let i = 0; i < m.addedNodes.length; i += 1) {
            enqueueSubtree(m.addedNodes[i]);
          }
        }
      }
      scheduleFlush();
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style"],
    });
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    pendingNodes.clear();
  }

  function scanWholeDocument() {
    if (!document.documentElement) return;

    processElement(document.documentElement);
    const all = document.querySelectorAll("*");
    const limit = Math.min(all.length, INITIAL_SCAN_LIMIT);
    for (let i = 0; i < limit; i += 1) {
      processElement(all[i]);
    }
  }

  // ===== ロジック処理位置（ON時） =====
  // 1) 計算後スタイルが none の要素のみ対象化
  // 2) 変更前インライン値を保存
  // 3) user-select: text !important を付与
  function applySelectablePolicyOnEnable() {
    scanWholeDocument();
    startObserver();
  }

  // ===== ロジック処理位置（OFF時） =====
  // 保存済みの変更前インライン値へ復元（none 固定で戻さない）
  function restoreSelectablePolicyOnDisable() {
    stopObserver();
    forEachTrackedElement((el) => restoreInlineUserSelect(el));
  }

  function reevaluateAll() {
    if (state.enabled) {
      applySelectablePolicyOnEnable();
    } else {
      restoreSelectablePolicyOnDisable();
    }
  }

  function applyUiStyle(el) {
    el.style.position = "fixed";
    el.style.right = "16px";
    el.style.bottom = "16px";
    el.style.borderRadius = "9999px";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.fontWeight = "700";
    el.style.fontFamily = "system-ui, -apple-system, Segoe UI, sans-serif";
    el.style.color = "#fff";
    el.style.cursor = "pointer";
    el.style.userSelect = "none";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,.25)";
    el.style.zIndex = "2147483647";
    el.style.pointerEvents = "auto";
    el.style.transition = "all 120ms ease";
  }

  function updateToggleUI(el) {
    const folded = state.uiFolded;
    el.style.width = folded ? "18px" : "40px";
    el.style.height = folded ? "18px" : "40px";
    el.style.fontSize = folded ? "10px" : "18px";
    el.style.background = state.enabled ? "#2ecc71" : "#e74c3c";
    el.textContent = folded ? "•" : state.enabled ? "S" : "×";
    el.title = state.enabled ? "Selectable Anywhere: ON" : "Selectable Anywhere: OFF";
    el.setAttribute("aria-label", el.title);
  }

  function createToggleUI() {
    const el = document.createElement("div");
    el.id = "sa-toggle-ui";
    el.setAttribute("data-sa-ui", "true");

    applyUiStyle(el);
    updateToggleUI(el);

    el.addEventListener("click", (ev) => {
      if (ev.shiftKey) {
        state.uiFolded = !state.uiFolded;
        saveState();
        updateToggleUI(el);
        return;
      }

      state.enabled = !state.enabled;
      saveState();
      updateToggleUI(el);
      reevaluateAll();
    });

    return el;
  }

  function mountUI() {
    const mount = () => {
      if (!document.body) return false;
      if (document.getElementById("sa-toggle-ui")) return true;
      document.body.appendChild(createToggleUI());
      return true;
    };

    if (!mount()) {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          mount();
        },
        { once: true }
      );
    }
  }

  mountUI();
  reevaluateAll();
})();
