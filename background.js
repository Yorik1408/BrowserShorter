let isRecording = false;

async function ensureOffscreenDocumentIfNeeded() {
  if (!chrome.offscreen) return false;
  try {
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["USER_MEDIA"],
        justification: "Screen recording in background"
      });
    }
    return true;
  } catch (err) {
    console.warn("Offscreen create/check failed:", err);
    return false;
  }
}

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  try {
    if (msg.action === "start-recording") {
      await ensureOffscreenDocumentIfNeeded();
      isRecording = true;
      chrome.runtime.sendMessage({ target: "offscreen", action: "start" });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === "stop-recording") {
      isRecording = false;
      chrome.runtime.sendMessage({ target: "offscreen", action: "stop" });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === "get-status") {
      sendResponse({ isRecording });
      return true;
    }

    if (msg.action === "take-screenshot-tab") {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (!dataUrl || chrome.runtime.lastError) {
          console.error("Screenshot tab failed:", chrome.runtime.lastError?.message);
          return;
        }
        chrome.downloads.download({
          url: dataUrl,
          filename: `screenshot-tab-${Date.now()}.png`
        });
      });
      sendResponse({ ok: true });
      return true;
    }

    // 🔹 ВАЖНО: пересылка команды выделения в content script
    if (msg.action === "start-area-selection") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        try {
      // пробуем вставить selection.js, если он ещё не подключён
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["selection.js"]
          });
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["selection.css"]
          });

      // отправляем команду на запуск выделения
          chrome.tabs.sendMessage(tab.id, { action: "start-area-selection" });
        } catch (err) {
          console.error("Ошибка запуска выделения области:", err);
        }
      }
      sendResponse({ ok: true });
      return true;
    }


    if (msg.action === "area-selected" && msg.rect && sender.tab) {
      const tabId = sender.tab.id;
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (!dataUrl || chrome.runtime.lastError) {
          console.error("captureVisibleTab failed:", chrome.runtime.lastError?.message);
          return;
        }
        chrome.tabs.sendMessage(tabId, {
          action: "crop-image",
          dataUrl,
          rect: msg.rect
        });
      });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === "save-screenshot" && msg.url) {
      chrome.downloads.download({
        url: msg.url,
        filename: `screenshot-area-${Date.now()}.png`
      });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === "save-video" && msg.url) {
      chrome.downloads.download({
        url: msg.url,
        filename: `recording-${Date.now()}.webm`
      });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.action === "recording-stopped") {
      isRecording = false;
      chrome.runtime.sendMessage({ action: "recording-stopped" });
      sendResponse({ ok: true });
      return true;
    }
  } catch (err) {
    console.error("background handler error:", err);
  }
  return false;
});
