// background.js
let isRecording = false;
let latestImageForEditor = null;
let latestEditorWindowId = null;
console.log("Service worker loaded and ready for hotkeys 🚀");

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

function openEditorWindow() {
  // Открываем окно редактора и запомним его id
  chrome.windows.create({
    url: chrome.runtime.getURL("editor.html"),
    type: "popup",
    width: 1000,
    height: 700
  }, (win) => {
    if (win && win.id) {
      latestEditorWindowId = win.id;
    }
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

    // === Take screenshot (whole visible tab) ===
    if (msg.action === "take-screenshot-tab") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
        if (!dataUrl || chrome.runtime.lastError) {
          console.error("Screenshot tab failed:", chrome.runtime.lastError?.message);
          return;
        }
        // Сохраняем снимок в памяти и открываем редактор — редактор запросит этот снимок сам
        latestImageForEditor = dataUrl;
        openEditorWindow();
      });
      sendResponse({ ok: true });
      return true;
    }

    // === Start area selection: инжектим selection.js в текущую вкладку ===
    if (msg.action === "start-area-selection") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        sendResponse({ ok: false });
        return true;
      }
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["selection.js"] });
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["selection.css"] });
      } catch (err) {
        // скрипт мог уже быть загружен — игнорируем ошибку
      }
      chrome.tabs.sendMessage(tab.id, { action: "start-area-selection" });
      sendResponse({ ok: true });
      return true;
    }

    // === area-selected: content script присылает координаты (в device pixels) ===
    // background делает captureVisibleTab и отправляет оригинальный dataUrl обратно в тот же таб
    if (msg.action === "area-selected" && msg.rect && sender.tab && sender.tab.id) {
      const tab = sender.tab;
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
        if (!dataUrl || chrome.runtime.lastError) {
          console.error("captureVisibleTab failed:", chrome.runtime.lastError?.message);
          return;
        }
        // Отправляем dataUrl и rect в content script (crop делается в страницном контексте)
        chrome.tabs.sendMessage(tab.id, { action: "crop-image", dataUrl, rect: msg.rect });
      });
      sendResponse({ ok: true });
      return true;
    }

    // === content script прислал уже обрезанную картинку (dataUrl) ===
    // сохраняем ее как "последний" и открываем редактор
    if (msg.action === "save-cropped-screenshot" && msg.url) {
      latestImageForEditor = msg.url;
      openEditorWindow();
      sendResponse({ ok: true });
      return true;
    }

    // === Editor запрашивает картинку (когда загрузился) ===
    if (msg.action === "request-image") {
      // отправляем последнее изображение и id открытого окна редактора
      sendResponse({ url: latestImageForEditor || null, windowId: latestEditorWindowId || null });
      // не очищаем latestImageForEditor — даём повторно использовать при необходимости
      return true;
    }

    // === Editor Save Screenshot ===
    if (msg.action === "save-screenshot" && msg.url) {
      chrome.downloads.download({
        url: msg.url,
        filename: `screenshot-${Date.now()}.png`
      }, () => {
        // после сохранения можно ответить
        sendResponse({ ok: true });
      });
      return true; // нужно, т.к. sendResponse будет вызван асинхронно
    }

    // === Offscreen: сохранить видео (dataURL) ===
    if (msg.action === "save-video" && msg.url) {
      chrome.downloads.download({
        url: msg.url,
        filename: `recording-${Date.now()}.webm`
      }, () => sendResponse({ ok: true }));
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

  chrome.commands.onCommand.addListener(async (command) => {
    console.log("Hotkey pressed:", command);

    if (command === "screenshot-area") {
      chrome.runtime.sendMessage({ action: "start-area-selection" });
    }

    if (command === "screenshot-tab") {
      chrome.runtime.sendMessage({ action: "take-screenshot-tab" });
    }

    if (command === "toggle-recording") {
      // узнаем статус записи
      const status = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "get-status" }, resolve);
      });

      if (status && status.isRecording) {
        chrome.runtime.sendMessage({ action: "stop-recording" });
      } else {
        chrome.runtime.sendMessage({ action: "start-recording" });
      }
    }
  });


  return false;
});
