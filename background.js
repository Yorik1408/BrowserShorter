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

// открываем редактор и передаем dataURL скриншота
function openEditorWithImage(dataUrl) {
  chrome.windows.create({
    url: "editor.html",
    type: "popup",
    width: 1000,
    height: 700
  }, (win) => {
    setTimeout(() => {
      chrome.tabs.sendMessage(win.tabs[0].id, { action: "load-screenshot", url: dataUrl });
    }, 300);
  });
}

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  try {
    // === Start recording ===
    if (msg.action === "start-recording") {
      await ensureOffscreenDocumentIfNeeded();
      isRecording = true;
      chrome.runtime.sendMessage({ target: "offscreen", action: "start" });
      sendResponse({ ok: true });
      return true;
    }

    // === Stop recording ===
    if (msg.action === "stop-recording") {
      isRecording = false;
      chrome.runtime.sendMessage({ target: "offscreen", action: "stop" });
      sendResponse({ ok: true });
      return true;
    }

    // === Status ===
    if (msg.action === "get-status") {
      sendResponse({ isRecording });
      return true;
    }

    // === Screenshot Tab ===
    if (msg.action === "take-screenshot-tab") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
        if (!dataUrl || chrome.runtime.lastError) {
          console.error("Screenshot tab failed:", chrome.runtime.lastError?.message);
          return;
        }
        openEditorWithImage(dataUrl);
      });
      sendResponse({ ok: true });
      return true;
    }

    // === Start Area Selection ===
    if (msg.action === "start-area-selection") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        sendResponse({ ok: false });
        return true;
      }
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["selection.js"] });
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["selection.css"] });
      } catch (err) {}
      chrome.tabs.sendMessage(tab.id, { action: "start-area-selection" });
      sendResponse({ ok: true });
      return true;
    }

    // === Content script прислал координаты области ===
    if (msg.action === "area-selected" && msg.rect && sender.tab && sender.tab.id) {
      const tab = sender.tab;
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
        if (!dataUrl || chrome.runtime.lastError) {
          console.error("captureVisibleTab failed:", chrome.runtime.lastError?.message);
          return;
        }
        chrome.tabs.sendMessage(tab.id, { action: "crop-image", dataUrl, rect: msg.rect });
      });
      sendResponse({ ok: true });
      return true;
    }

    // === Content script прислал уже обрезанную картинку ===
    if (msg.action === "save-cropped-screenshot" && msg.url) {
      openEditorWithImage(msg.url);
      sendResponse({ ok: true });
      return true;
    }

    // === Editor Save Screenshot ===
    if (msg.action === "save-screenshot" && msg.url) {
      chrome.downloads.download({
        url: msg.url,
        filename: `screenshot-${Date.now()}.png`
      }, () => sendResponse({ ok: true }));
      return true; // важно для асинхронного sendResponse
    }

    // === Offscreen видео ===
    if (msg.action === "save-video" && msg.url) {
      chrome.downloads.download({ url: msg.url, filename: `recording-${Date.now()}.webm` });
      sendResponse({ ok: true });
      return true;
    }

    // === Offscreen сообщает, что запись остановлена ===
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
