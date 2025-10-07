// выбор области + отправка обрезанной картинки в background
window.__screenshot = window.__screenshot || {};
if (!window.__screenshot.initialized) {
  window.__screenshot.initialized = true;
  window.__screenshot.overlay = null;
  window.__screenshot.box = null;
  window.__screenshot.startX = 0;
  window.__screenshot.startY = 0;
  window.__screenshot.isSelecting = false;

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "start-area-selection") startSelection();
    if (msg.action === "crop-image" && msg.dataUrl && msg.rect) cropImageAndSend(msg.dataUrl, msg.rect);
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
    document.documentElement.appendChild(overlay);
    window.__screenshot.overlay = overlay;

    overlay.addEventListener("mousedown", onMouseDown);

    function onMouseDown(e) {
      if (e.button !== 0) return;
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
      window.__screenshot.box = box;

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
        overlay.removeEventListener("mousedown", onMouseDown);

        const rect = box.getBoundingClientRect();
        if (box) box.remove();
        if (overlay) overlay.remove();
        window.__screenshot.isSelecting = false;

        const scale = window.devicePixelRatio || 1;
        const scaledRect = {
          left: Math.round(rect.left * scale),
          top: Math.round(rect.top * scale),
          width: Math.round(rect.width * scale),
          height: Math.round(rect.height * scale)
        };

        chrome.runtime.sendMessage({ action: "area-selected", rect: scaledRect });
      }

      overlay.addEventListener("mousemove", onMove);
      overlay.addEventListener("mouseup", onUp);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        if (window.__screenshot.box) window.__screenshot.box.remove();
        if (window.__screenshot.overlay) window.__screenshot.overlay.remove();
        window.__screenshot.isSelecting = false;
        document.removeEventListener("keydown", onKey);
      }
    }
    document.addEventListener("keydown", onKey);
  }

  function cropImageAndSend(dataUrl, rect) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height, 0, 0, rect.width, rect.height);
      const croppedUrl = canvas.toDataURL("image/png");
      chrome.runtime.sendMessage({ action: "save-cropped-screenshot", url: croppedUrl });
    };
    img.src = dataUrl;
  }
}
