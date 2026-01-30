(() => {
  "use strict";

  /********************
   * Overlay base
   ********************/
  const OVERLAY_ATTR = "data-atg-overlay-id";
  const MARK_ATTR = "data-atg-marked";
  const overlays = new Map();

  const now = () => Date.now();

  const API_KEY = "AIzaSyBkaTr1HX9DAW7ENpz3e7cLoJSssvnWUCU";
  const MODEL_NAME = "gemini-2.5-flash";

  /************************************************
   * [3] 깃발(Flag) 시스템: 캡처 및 AI 분석 실행
   ************************************************/
  async function runAIAnalysis() {
    console.log("📸 [AI 단계] 캡처 시작...");
    try {
      const response = await chrome.runtime.sendMessage({ action: "CAPTURE_SCREENSHOT" });
      if (!response?.imgData) return;

      const result = await callGemini(response.imgData.split(',')[1]);
      console.log("🤖 [AI 단계] 분석 완료:", result);

      if (result.detected_type === 3) {
        console.log("⚠️ [유형 3] 유료 서비스 가입 유도 (의심)");

        // 1. 화면의 메인 영역에 점선 박스를 칩니다 (다른 유형과 동일)
        // 보통 가입 폼이 있는 'main'이나 'body'를 타겟으로 잡습니다.
        const targetEl = document.querySelector('main') || document.body;
        
        ensureOverlayFor(targetEl, "유형3 · 유료 서비스 가입 유도(AI 감지)", {
          overlayClass: "atg-overlay-type2", // 기존 빨간 점선 스타일 활용
          type: "type3"
        });

        // 2. 순돌이 가이드 창을 띄웁니다
        showGuide("type3"); 
        
        // (참고) 이전의 뻘건 테두리(danger-overlay)는 제거했습니다.
      }
    } catch (e) {
      console.error("AI 분석 중 에러:", e);
    }
  }

  async function callGemini(base64Image) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
    const payload = {
      system_instruction: { parts: [{ text: `다크패턴 분석기입니다. 제공된 웹페이지 스크린샷을 분석하여 3가지 다크패턴 유형(1~3) 중 가장 일치하는 하나를 선택하세요.
        [분류 규칙]
               1. 유형 1: 닫기 버튼 있는 팝업
               2. 유형 2: 외부이동 링크/광고
               3. 유형 3: 유료 서비스 가입 유도
               
               [출력 형식]
               반드시 아래의 JSON 구조로만 응답해야 하며, 다른 텍스트는 절대 포함하지 마세요.
               {
                 "detected_type": number, 
                 "confidence": number, 
                 "reason": "string",
                 "target_element": { "description": "string", "coordinates": "string" }
               }
               NO CONVERSATIONAL FILLER. START DIRECTLY WITH '{'. DO NOT SAY 'HERE IS THE JSON'.`}] },
      contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: base64Image } }] }],
      generationConfig: { response_mime_type: "application/json" }
    };
    const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  }

  function safeText(el) {
    try {
      return (el?.innerText || el?.textContent || "").trim().slice(0, 2000);
    } catch {
      return "";
    }
  }

  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 16 || r.height < 16) return false;
    return true;
  }

  function hostname(url) {
    try {
      return new URL(url, location.href).hostname;
    } catch {
      return "";
    }
  }

  function isExternalHref(href) {
    if (!href) return false;
    if (
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) return false;
    const host = hostname(href);
    if (!host) return false;
    return host !== location.hostname;
  }

  function normalizeUrl(href) {
    try {
      return new URL(href, location.href).toString();
    } catch {
      return href || "";
    }
  }

  function hasTrackingParams(url) {
    try {
      const u = new URL(url, location.href);
      const keys = [...u.searchParams.keys()].map(k => k.toLowerCase());
      return keys.some(k =>
        k.startsWith("utm_") ||
        k === "gclid" ||
        k === "fbclid" ||
        k === "gad_source" ||
        k === "gad_campaignid" ||
        k === "placement" ||
        k === "target" ||
        k === "clickid" ||
        k === "adid"
      );
    } catch {
      return false;
    }
  }

  function textHasAny(text, words) {
    const t = (text || "").toLowerCase();
    return words.some(w => t.includes(String(w).toLowerCase()));
  }

  function makeId() {
    return String(now()) + "-" + Math.random().toString(16).slice(2);
  }

  // ✅ FIX: overlay / element에 type 저장
  function ensureOverlayFor(el, label, opts = {}) {
    if (!el || el.nodeType !== 1) return;
    if (el.getAttribute(MARK_ATTR) === "1") return;

    const r = el.getBoundingClientRect();
    if (r.width < 18 || r.height < 18) return;

    const id = makeId();
    const type = opts.type || "unknown"; // ✅ 추가

    el.setAttribute(MARK_ATTR, "1");
    el.classList.add("atg-marked");
    el.setAttribute(OVERLAY_ATTR, id);
    el.dataset.atgType = type; // ✅ 추가

    const ov = document.createElement("div");
    ov.className = "atg-overlay" + (opts.overlayClass ? ` ${opts.overlayClass}` : "");
    ov.dataset.atgId = id;
    ov.dataset.atgType = type; // ✅ 추가

    const lb = document.createElement("div");
    lb.className = "atg-label";
    lb.textContent = label;

    ov.appendChild(lb);
    document.documentElement.appendChild(ov);
    overlays.set(id, ov);

    positionOverlay(el);
  }

  function positionOverlay(el) {
    const id = el.getAttribute(OVERLAY_ATTR);
    if (!id) return;
    const ov = overlays.get(id);
    if (!ov) return;

    const rect = el.getBoundingClientRect();
    const left = rect.left + window.scrollX;
    const top = rect.top + window.scrollY;
    const pad = 6;

    ov.style.left = Math.max(0, left - pad) + "px";
    ov.style.top = Math.max(0, top - pad) + "px";
    ov.style.width = Math.max(0, rect.width + pad * 2) + "px";
    ov.style.height = Math.max(0, rect.height + pad * 2) + "px";
  }

  function repositionAll() {
    for (const el of document.querySelectorAll(`[${OVERLAY_ATTR}]`)) {
      positionOverlay(el);
    }
  }

  window.addEventListener("scroll", repositionAll, { passive: true });
  window.addEventListener("resize", repositionAll, { passive: true });

  /********************
   * Guide UI
   ********************/
  let guideEl = null;
  const shownGuide = new Set();

  function removeGuide() {
    if (guideEl) guideEl.remove();
    guideEl = null;
    const mascot = document.querySelector(".atg-mascot-img");
    if (mascot) mascot.remove();
  }

  function getGuideConfig(type) {
    if (type === "type1") {
      return {
        title: "팝업 광고를 감지했어요",
        text: "낚시용 X/닫기 대신, 실제로 닫히는 버튼(진짜 닫기)을 표시했어요.",
        buttons: [{ label: "알겠어요", action: "dismiss" }]
      };
    }
    if (type === "type2") {
      return {
        title: "외부로 연결되는 광고 링크예요",
        text: "클릭하면 다른 사이트로 이동할 수 있어요. 이동 전 주소를 확인하세요.",
        buttons: [{ label: "알겠어요", action: "dismiss", primary: true }]
      };
    }
    return {
      title: "유료 서비스 가입 유도(의심)입니다",
      text: "원치 않는 결제/부가서비스 가입으로 이어질 수 있어요.",
      buttons: [
        { label: "창 닫기", action: "go_back", primary: true },
        { label: "알겠어요", action: "dismiss" }
      ]
    };
  }

  function showGuide(type, opts = {}) {
    // type2는 “여러 개 제거”가 필요하니, 이미 떠 있어도 유지
    // 단, 가이드가 이미 있으면 굳이 새로 만들지 않음
    if (shownGuide.has(type) && guideEl?.isConnected) return;
    shownGuide.add(type);

    const config = getGuideConfig(type);

    removeGuide();

    guideEl = document.createElement("div");
    guideEl.className = "atg-guide";
    guideEl.setAttribute("role", "dialog");
    guideEl.setAttribute("aria-label", "광고 탐지 안내");
    guideEl.dataset.atgType = type;

    const mascot = document.createElement("img");
    mascot.src = chrome.runtime.getURL("dog.gif");
    mascot.className = "atg-mascot-img";
    mascot.setAttribute("alt", "Guard Mascot");
    document.documentElement.appendChild(mascot);

    guideEl.innerHTML = `
      <div class="atg-guide-header">
        <div class="atg-guide-badge">🛡️ 광고탐지견 순돌이 <span style="opacity:.55;font-weight:800">· 안내</span></div>
      </div>

      <div class="atg-guide-body">
        <div class="atg-mascot-placeholder"></div>
        <div>
          <h3 class="atg-guide-title">${config.title}</h3>
          <p class="atg-guide-text">${config.text}</p>
        </div>
      </div>

      <div class="atg-guide-actions">
        ${config.buttons.map(b => `
          <button class="atg-btn ${b.primary ? "atg-btn-primary" : ""}" data-atg-action="${b.action}">
            ${b.label}
          </button>
        `).join("")}
      </div>
    `;

    document.documentElement.appendChild(guideEl);
    setTimeout(() => guideEl.classList.add("visible"), 120);

    mascot.addEventListener("click", () => {
      guideEl.classList.toggle("visible");
    });

    guideEl.querySelectorAll("[data-atg-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-atg-action");
        handleGuideAction(action, type, opts);
      });
    });
  }

  // ✅ type2 overlay 1개씩 제거용
  function getVisibleOverlaysByType(type) {
    const list = [...document.querySelectorAll(`.atg-overlay[data-atg-type="${type}"]`)]
      .filter(ov => ov.isConnected && ov.style.display !== "none")
      .filter(ov => {
        const r = ov.getBoundingClientRect();
        return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
      });

    list.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return list;
  }

  function removeOneOverlay(ov) {
    const id = ov?.dataset?.atgId;
    ov?.remove();
    if (!id) return;

    const originalEl = document.querySelector(`[data-atg-overlay-id="${id}"]`);
    if (originalEl) {
      originalEl.classList.remove("atg-marked");
      originalEl.removeAttribute("data-atg-marked");
      originalEl.removeAttribute("data-atg-overlay-id");
      delete originalEl.dataset.atgType;
    }
  }

  function handleGuideAction(action, type, opts) {
    if (action === "go_back") {
      history.back();
      return;
    }

    if (action === "dismiss") {
      // ✅ type1: 진짜닫기 표시(빨간 박스/라벨)는 유지해야 함 -> 가이드만 닫기
      if (type === "type1") {
        removeGuide();
        shownGuide.delete("type1");
        return;
      }

      // ✅ type2: overlay(박스)만 1개씩 제거, 남아있으면 강아지 유지
      if (type === "type2") {
        const visibles = getVisibleOverlaysByType("type2");

        if (visibles.length > 0) {
          removeOneOverlay(visibles[0]);
        } else {
          const any = document.querySelector(`.atg-overlay[data-atg-type="type2"]`);
          if (any) removeOneOverlay(any);
        }

        const remaining = document.querySelectorAll(`.atg-overlay[data-atg-type="type2"]`).length;

        if (remaining === 0) {
          removeGuide();
          shownGuide.delete("type2");
        } else {
          // 강아지 유지 (아무 것도 안 함)
        }
        return;
      }

      // 기타 타입: 가이드만 닫기
      removeGuide();
      shownGuide.delete(type);
      return;
    }
  }

  /********************
   * Type1: Real close candidates
   ********************/
  const CLOSE_HINT_WORDS = ["닫기", "close", "취소", "나가기", "×", "x", "cancel", "dismiss"];

  function findRealCloseCandidates(popupEl) {
    const candidates = [...popupEl.querySelectorAll(
      "button,[role='button'],a,input[type='button'],input[type='submit'],[aria-label],[title]"
    )].filter(el => visible(el)).slice(0, 180);

    const scored = candidates.map(el => {
      const tag = el.tagName.toLowerCase();
      const text = (el.innerText || el.textContent || "").trim();
      const aria = (el.getAttribute("aria-label") || "").trim();
      const title = (el.getAttribute("title") || "").trim();
      const cls = (el.className || "").toString().toLowerCase();
      const id = (el.id || "").toLowerCase();
      const href = (tag === "a") ? (el.getAttribute("href") || "") : "";

      let score = 0;

      if (textHasAny(text, CLOSE_HINT_WORDS)) score += 7;
      if (textHasAny(aria, CLOSE_HINT_WORDS)) score += 7;
      if (textHasAny(title, CLOSE_HINT_WORDS)) score += 6;
      if (textHasAny(cls, ["close", "dismiss", "modal-close", "popup-close", "btn-close"])) score += 5;
      if (textHasAny(id, ["close", "dismiss"])) score += 4;

      if (text === "×" || text.toLowerCase() === "x") score += 3;

      // bait CTA 감점
      if (textHasAny(text, ["가입", "신청", "확인", "무료", "동의", "accept", "continue", "install", "download"])) score -= 7;

      // 외부 링크는 닫기 아닐 확률 큼
      if (href && isExternalHref(href)) score -= 9;
      if (href && hasTrackingParams(href)) score -= 4;

      // 상단/우상단 근접 가산
      const r = el.getBoundingClientRect();
      const distToTopRight = Math.hypot(window.innerWidth - r.right, r.top);
      if (distToTopRight < 220) score += 2;

      return { el, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter(x => x.score >= 3).slice(0, 3);
  }

  /********************
   * Real close overlay (do NOT touch the element)
   ********************/
  let realCloseBox = null;
  let realCloseLabel = null;
  let realCloseTarget = null;
  let raf = null;

  function clearRealCloseOverlay() {
    if (realCloseBox) realCloseBox.remove();
    if (realCloseLabel) realCloseLabel.remove();
    realCloseBox = null;
    realCloseLabel = null;
  }

  function drawRealCloseOverlay(el) {
    clearRealCloseOverlay();

    const r = el.getBoundingClientRect();
    const x = r.left + window.scrollX;
    const y = r.top + window.scrollY;

    realCloseBox = document.createElement("div");
    realCloseBox.className = "adtrap-highlight";
    realCloseBox.style.left = `${x - 3}px`;
    realCloseBox.style.top = `${y - 3}px`;
    realCloseBox.style.width = `${r.width + 6}px`;
    realCloseBox.style.height = `${r.height + 6}px`;

    realCloseLabel = document.createElement("div");
    realCloseLabel.className = "adtrap-label";
    realCloseLabel.textContent = "진짜 닫기";
    realCloseLabel.style.left = `${x}px`;
    realCloseLabel.style.top = `${Math.max(y - 28, 0)}px`;

    document.documentElement.appendChild(realCloseBox);
    document.documentElement.appendChild(realCloseLabel);
  }

  function repositionRealCloseOverlay() {
    if (!realCloseTarget || !realCloseTarget.isConnected) return;
    const r = realCloseTarget.getBoundingClientRect();
    const x = r.left + window.scrollX;
    const y = r.top + window.scrollY;

    if (realCloseBox) {
      realCloseBox.style.left = `${x - 3}px`;
      realCloseBox.style.top = `${y - 3}px`;
      realCloseBox.style.width = `${r.width + 6}px`;
      realCloseBox.style.height = `${r.height + 6}px`;
    }
    if (realCloseLabel) {
      realCloseLabel.style.left = `${x}px`;
      realCloseLabel.style.top = `${Math.max(y - 28, 0)}px`;
    }
  }

  function highlightRealCloseButton(popupEl) {
    // popupEl 내부 후보 우선 → 없으면 body에서도 보완(실제 사이트에서 종종 필요)
    let candidates = findRealCloseCandidates(popupEl);
    if (!candidates || candidates.length === 0) {
      candidates = findRealCloseCandidates(document.body);
    }
    if (!candidates || candidates.length === 0) {
      clearRealCloseOverlay();
      realCloseTarget = null;
      return;
    }

    realCloseTarget = candidates[0].el;
    drawRealCloseOverlay(realCloseTarget);

    if (raf) cancelAnimationFrame(raf);
    const tick = () => {
      repositionRealCloseOverlay();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  /********************
   * Type1 popup detection
   ********************/
  function isPopupShell(el) {
    if (!visible(el)) return false;

    const cs = getComputedStyle(el);
    const pos = cs.position;
    if (!(pos === "fixed" || pos === "sticky")) return false;

    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    const screen = window.innerWidth * window.innerHeight;

    if (area < screen * 0.10) return false;
    return true;
  }

  function detectType1Popups(root = document) {
    const candidates = [...root.querySelectorAll("div, section, aside, dialog")].slice(0, 900);

    for (const el of candidates) {
      if (el.getAttribute(MARK_ATTR) === "1") continue;
      if (!isPopupShell(el)) continue;

      const txt = safeText(el);
      const hasCloseHint = textHasAny(txt, CLOSE_HINT_WORDS) || findRealCloseCandidates(el).length > 0;
      if (!hasCloseHint) continue;

      ensureOverlayFor(el, "유형1 · 닫기 버튼 있는 팝업(의심)", {
        overlayClass: "atg-overlay-type1",
        type: "type1" // ✅ 추가
      });

      setTimeout(() => highlightRealCloseButton(el), 120);
      showGuide("type1", { popupEl: el });
    }
  }

  /********************
   * Type2 detection
   ********************/
  function findArticleRoot() {
    return (
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body
    );
  }

  function isAdIframe(iframe) {
    const src = (iframe.getAttribute("src") || "").toLowerCase();
    return (
      src.includes("doubleclick") ||
      src.includes("googlesyndication") ||
      src.includes("googleads") ||
      src.includes("adservice") ||
      src.includes("/ads") ||
      src.includes("adserver")
    );
  }

  function detectType2Links() {
    const root = findArticleRoot();
    if (!root) return;

    const links = [...root.querySelectorAll("a[href]")].filter(a => visible(a)).slice(0, 2000);
    let found = false;

    for (const a of links) {
      if (a.getAttribute(MARK_ATTR) === "1") continue;

      const href = normalizeUrl(a.getAttribute("href") || "");
      if (!href) continue;

      const ext = isExternalHref(href);
      const tracky = hasTrackingParams(href);
      if (!ext && !tracky) continue;

      ensureOverlayFor(a, "유형2 · 외부이동 링크/광고(의심)", {
        overlayClass: "atg-overlay-type2",
        type: "type2" // ✅ 추가
      });
      found = true;
    }

    const iframes = [...root.querySelectorAll("iframe")].filter(fr => visible(fr)).slice(0, 80);
    for (const fr of iframes) {
      if (fr.getAttribute(MARK_ATTR) === "1") continue;
      if (!isAdIframe(fr)) continue;

      ensureOverlayFor(fr, "유형2 · 외부광고 영역(의심)", {
        overlayClass: "atg-overlay-type2",
        type: "type2" // ✅ 추가
      });
      found = true;
    }

    if (found) showGuide("type2");
  }

  /********************
   * Main scan loop
   ********************/
  let lastScan = 0;

  function scanAll() {
    const t = now();
    if (t - lastScan < 450) return;
    lastScan = t;

    detectType1Popups(document);
    detectType2Links();

    setTimeout(repositionAll, 60);
    setTimeout(repositionAll, 320);
  }

  function observeDom() {
    const obs = new MutationObserver((mutations) => {
      let added = 0;
      for (const m of mutations) added += m.addedNodes?.length || 0;
      if (added > 0) scanAll();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  /************************************************
   * [4] 트리거: 유형 2 클릭 시 깃발 꽂기
   ************************************************/
  document.addEventListener("mousedown", (e) => {
    const el = e.target;
    const target = el.closest('.atg-marked, [data-atg-type="type2"], .img_ad');

    if (target) {
      console.log("🚩 [클릭 포착] 깃발을 꽂고 이동을 지켜봅니다.");

      // [중요] e.preventDefault()를 제거했습니다. 
      // 대신 현재 URL을 함께 저장해서 '제자리 캡처'를 방지합니다.
      chrome.storage.local.set({ 
        "pending_ai_check": true,
        "source_url": window.location.href // 출발지 주소 기록
      }, () => {
        console.log("✅ [기록 완료] 이제 브라우저가 자연스럽게 이동시킵니다.");
      });
    }
  }, true);
function initAICheck() {
  if (window.top !== window) return; // 메인 창에서만 실행

  chrome.storage.local.get(["pending_ai_check", "source_url"], (res) => {
    if (res.pending_ai_check) {
      // [핵심 로직] 현재 주소가 출발지 주소와 다를 때만 AI 실행!
      if (res.source_url && res.source_url !== window.location.href) {
        console.log("🔥 [단계 2] 새로운 페이지 도착 확인! AI 분석 가동.");
        chrome.storage.local.remove(["pending_ai_check", "source_url"]);
        setTimeout(runAIAnalysis, 2500); 
      } else {
        // 이동이 안 되고 제자리에 있다면 깃발을 지우지 않고 대기하거나, 
        // 혹은 실수 방지를 위해 로그만 남깁니다.
        console.log("⚪ [대기] 아직 같은 페이지입니다. 이동을 기다리는 중...");
      }
    }
  });
}
  /************************************************
   * [5] 팀원들의 기존 UI 로직 (ensureOverlayFor, showGuide 등)
   ************************************************/
  // ... (팀원들이 짠 600줄의 본체 코드를 여기에 그대로 두세요) ...
  // ... (findRealCloseCandidates, detectType1Popups 등 함수들) ...

  /************************************************
   * [6] 초기 가동 및 깃발 체크
   ************************************************/
  function init() {
    // 1. 깃발 확인 (이전 페이지에서 왔는지)
    chrome.storage.local.get(["pending_ai_check"], (res) => {
      if (res.pending_ai_check) {
        console.log("🔥 [발견] 깃발 확인! AI 분석 가동!");
        chrome.storage.local.remove("pending_ai_check");
        setTimeout(runAIAnalysis, 2500);
      }
    })}

  observeDom();
  scanAll();
  initAICheck();
})();
