// selection.js — content script. Всю логику выделения реализует здесь.
// Используем window.* чтобы избежать ошибок при повторном инжекте.

window.__screenshot = window.__screenshot || {};
if (!window.__screenshot.initialized) {
  window.__screenshot.initialized = true;
  window.__screenshot.overlay = null;
  window.__screenshot.selectionBox = null;
  window.__screenshot.startX = 0;
  window.__screenshot.startY = 0;
  window.__screenshot.isSelecting = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "start-area-selection") startSelection();
    if (msg.action === "crop-image" && msg.dataUrl && msg.rect) cropImageAndSave(msg.dataUrl, msg.rect);
  });

  function startSelection() {
    if (window.__screenshot.isSelecting) return;
    window.__screenshot.isSelecting = true;

    const overlay = document.createElement("div");
    overlay.id = "screenshot-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.zIndex = "2147483647";
    overlay.style.cursor = "crosshair";
    overlay.style.userSelect = "none";
    document.documentElement.appendChild(overlay);
    window.__screenshot.overlay = overlay;

    function onMouseDown(e) {
      window.__screenshot.startX = e.clientX;
      window.__screenshot.startY = e.clientY;

      const box = document.createElement("div");
      box.id = "screenshot-selection";
      box.style.position = "absolute";
      box.style.border = "2px solid #4AD865";
      box.style.background = "rgba(74,216,101,0.2)";
      box.style.left = `${window.__screenshot.startX}px`;
      box.style.top = `${window.__screenshot.startY}px`;
      overlay.appendChild(box);
      window.__screenshot.selectionBox = box;

      function onMove(ev) {
        const x = Math.min(ev.clientX, window.__screenshot.startX);
        const y = Math.min(ev.clientY, window.__screenshot.startY);
        const w = Math.abs(ev.clientX - window.__screenshot.startX);
        const h = Math.abs(ev.clientY - window.__screenshot.startY);
        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
        box.style.width = `${w}px`;
        box.style.height = `${h}px`;
      }

      function onUp(ev) {
        overlay.removeEventListener("mousemove", onMove);
        overlay.removeEventListener("mouseup", onUp);
        overlay.removeEventListener("mousedown", onDown);

        const rect = box.getBoundingClientRect();

        // clean UI
        if (box) box.remove();
        if (overlay) overlay.remove();
        window.__screenshot.selectionBox = null;
        window.__screenshot.overlay = null;
        window.__screenshot.isSelecting = false;

        // Scale coordinates by devicePixelRatio for correct cropping of captureVisibleTab
        const scale = window.devicePixelRatio || 1;
        const scaledRect = {
          x: Math.round(rect.left * scale),
          y: Math.round(rect.top * scale),
          width: Math.round(rect.width * scale),
          height: Math.round(rect.height * scale)
        };

        // отправляем координаты в background — background сделает captureVisibleTab и пришлёт картинку назад для кропа
        chrome.runtime.sendMessage({ action: "area-selected", rect: scaledRect });
      }

      overlay.addEventListener("mousemove", onMove);
      overlay.addEventListener("mouseup", onUp);
    }

    function onDown(e) {
      // исходным было нажатие левой кнопкой
      if (e.button !== 0) return;
      onMouseDown(e);
    }

    overlay.addEventListener("mousedown", onDown);

    // Отмена по Escape
    function onKey(e) {
      if (e.key === "Escape") {
        if (window.__screenshot.selectionBox) window.__screenshot.selectionBox.remove();
        if (window.__screenshot.overlay) window.__screenshot.overlay.remove();
        window.__screenshot.isSelecting = false;
        document.removeEventListener("keydown", onKey);
      }
    }
    document.addEventListener("keydown", onKey);
  }

  function cropImageAndSave(dataUrl, rect) {
    // dataUrl — картинка всей видимой области вкладки (из captureVisibleTab)
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext("2d");
        // srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH
        ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
        const croppedUrl = canvas.toDataURL("image/png");
        // отправляем обрезанную картинку в background для сохранения
        chrome.runtime.sendMessage({ action: "save-screenshot", url: croppedUrl });
      } catch (err) {
        console.error("cropImageAndSave error:", err);
      }
    };
    img.onerror = (e) => {
      console.error("Failed to load captured image for cropping", e);
    };
    img.src = dataUrl;
  }
}