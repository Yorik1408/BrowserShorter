// selection.js — встраивается в страницу при запросе выделения области
(function () {
  if (window.__screenshot_injected) return;
  window.__screenshot_injected = true;

  let overlay = null;
  let box = null;
  let startX = 0, startY = 0;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "start-area-selection") {
      startSelection();
    }
    if (msg.action === "crop-image" && msg.dataUrl && msg.rect) {
      cropImageAndSend(msg.dataUrl, msg.rect);
    }
  });

  function startSelection() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "screenshot-overlay";
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.zIndex = "2147483647";
    overlay.style.cursor = "crosshair";
    document.documentElement.appendChild(overlay);

    function onDown(e) {
      if (e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;

      box = document.createElement("div");
      box.id = "screenshot-selection";
      box.style.position = "absolute";
      box.style.left = `${startX}px`;
      box.style.top = `${startY}px`;
      box.style.width = "0px";
      box.style.height = "0px";
      box.style.border = "2px solid #4AD865";
      box.style.background = "rgba(74,216,101,0.2)";
      overlay.appendChild(box);

      overlay.addEventListener("mousemove", onMove);
      overlay.addEventListener("mouseup", onUp);
    }

    function onMove(e) {
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${w}px`;
      box.style.height = `${h}px`;
    }

    function onUp(e) {
      overlay.removeEventListener("mousemove", onMove);
      overlay.removeEventListener("mouseup", onUp);
      overlay.removeEventListener("mousedown", onDown);

      const rect = box.getBoundingClientRect();

      // cleanup UI
      if (box) box.remove();
      if (overlay) overlay.remove();
      box = null;
      overlay = null;

      // масштабируем в device pixels (captureVisibleTab возвращает device pixels)
      const scale = window.devicePixelRatio || 1;
      const scaledRect = {
        x: Math.round(rect.left * scale),
        y: Math.round(rect.top * scale),
        width: Math.round(rect.width * scale),
        height: Math.round(rect.height * scale)
      };

      // отправляем координаты в background — background сделает captureVisibleTab и пришлёт dataUrl обратно
      chrome.runtime.sendMessage({ action: "area-selected", rect: scaledRect });
    }

    overlay.addEventListener("mousedown", onDown);

    // отмена по Escape
    function onKey(e) {
      if (e.key === "Escape") {
        if (box) box.remove();
        if (overlay) overlay.remove();
        box = null;
        overlay = null;
      }
      document.removeEventListener("keydown", onKey);
    }
    document.addEventListener("keydown", onKey);
  }

  // Получаем dataUrl от background и делаем финальный кроп в контексте страницы
  function cropImageAndSend(dataUrl, rect) {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = rect.width;
        canvas.height = rect.height;
        const ctx = canvas.getContext("2d");
        // dataUrl уже в device pixels — просто используем rect как есть
        ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
        const croppedUrl = canvas.toDataURL("image/png");
        // отправляем обрезанную картинку в background (он откроет редактор)
        chrome.runtime.sendMessage({ action: "save-cropped-screenshot", url: croppedUrl });
      } catch (err) {
        console.error("cropImageAndSend error:", err);
      }
    };
    img.onerror = (e) => {
      console.error("Failed to load image for cropping", e);
    };
    img.src = dataUrl;
  }
})();
