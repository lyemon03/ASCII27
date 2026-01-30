// 1. 기존 탭 상태 관리 변수 (유지)
const tabState = new Map(); // tabId -> { lastHost, hopCount, lastUpdate }

// 2. 탭 업데이트 감시 (Hops 추적 로직 유지)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.url || !changeInfo.url) return;

  try {
    const url = new URL(changeInfo.url);
    const host = url.host;

    const st = tabState.get(tabId) || { lastHost: host, hopCount: 0, lastUpdate: Date.now() };
    if (st.lastHost && st.lastHost !== host) st.hopCount += 1;
    st.lastHost = host;
    st.lastUpdate = Date.now();
    tabState.set(tabId, st);

    console.log(`탭 ${tabId} 이동 횟수: ${st.hopCount}`);
  } catch (e) {}
});

// 3. 중앙 메시지 리스너 (캡처 기능 추가!)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "CAPTURE_SCREENSHOT") {
    console.log("📸 [Background] 캡처 요청 수신됨. 탭 ID:", sender.tab.id);
    
    chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 60 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error("❌ [Background] 캡처 실패:", chrome.runtime.lastError.message);
        sendResponse({ imgData: null });
      } else {
        console.log("✅ [Background] 캡처 성공. 데이터 전송 중...");
        sendResponse({ imgData: dataUrl });
      }
    });
    return true; 
  }

  // B. 기존 탭 이동 정보 요청 처리
  if (msg?.type === "GET_TAB_NAV") {
    const tabId = sender.tab?.id;
    const st = tabState.get(tabId) || { hopCount: 0 };
    sendResponse({ hopCount: st.hopCount || 0 });
  }
});

// 4. 메모리 관리 (탭이 닫히면 상태 삭제)
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});