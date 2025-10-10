// editor.js
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");
let currentTool = "pen";
let currentColor = "#ff0000"; // по умолчанию красный
let drawing = false;
let startX = 0, startY = 0;
let editorWindowId = null;
let bgImage = new Image();
let tempRect = null;

// цветовой пикер
const colorPicker = document.getElementById("colorPicker");
colorPicker.addEventListener("input", (e) => {
  currentColor = e.target.value;
});

// подгоняем canvas под окно
function fitCanvasToWindow() {
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = (window.innerHeight - 50) + "px";
}
fitCanvasToWindow();
window.addEventListener("resize", fitCanvasToWindow);

// toolbar
document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.onclick = () => { currentTool = btn.dataset.tool; };
});

// Save
document.getElementById("saveBtn").onclick = () => {
  const url = canvas.toDataURL("image/png");
  chrome.runtime.sendMessage({ action: "save-screenshot", url }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error("Save failed:", chrome.runtime.lastError.message);
      return;
    }
    if (resp && resp.ok) {
      chrome.runtime.sendMessage({ action: "request-image" }, (r) => {
        const winId = r && r.windowId;
        if (winId) chrome.windows.remove(winId);
        else window.close();
      });
    }
  });
};

// Получаем изображение от background
chrome.runtime.sendMessage({ action: "request-image" }, (resp) => {
  if (!resp || !resp.url) return;
  editorWindowId = resp.windowId || null;
  bgImage = new Image();
  bgImage.onload = () => {
    canvas.width = bgImage.naturalWidth;
    canvas.height = bgImage.naturalHeight;
    ctx.drawImage(bgImage, 0, 0);
    canvas.style.maxWidth = "100%";
    canvas.style.maxHeight = "calc(100% - 50px)";
  };
  bgImage.src = resp.url;
});

// конвертация координат
function clientToCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

// === Рисование ===
canvas.addEventListener("mousedown", (e) => {
  const pos = clientToCanvasCoords(e);
  drawing = true;
  startX = pos.x;
  startY = pos.y;

  if (currentTool === "text") {
    const text = prompt("Введите текст:");
    if (text) {
      ctx.fillStyle = currentColor;
      const fontSize = Math.max(12, Math.round(canvas.width * 0.02));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillText(text, startX, startY);
    }
    drawing = false;
  }

  if (currentTool === "pen") {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineWidth = Math.max(1, Math.round(canvas.width * 0.0025));
    ctx.strokeStyle = currentColor;
    ctx.lineCap = "round";
  }

  if (currentTool === "rectangle") {
    tempRect = { x: startX, y: startY, w: 0, h: 0 };
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);

  if (currentTool === "pen") {
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  if (currentTool === "rectangle" && tempRect) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage, 0, 0);
    const w = pos.x - startX;
    const h = pos.y - startY;
    ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.0025));
    ctx.strokeStyle = currentColor;
    ctx.strokeRect(startX, startY, w, h);
    tempRect.w = w;
    tempRect.h = h;
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);

  if (currentTool === "arrow") {
    drawArrow(ctx, startX, startY, pos.x, pos.y);
  } else if (currentTool === "pen") {
    ctx.closePath();
  } else if (currentTool === "rectangle" && tempRect) {
    const w = pos.x - startX;
    const h = pos.y - startY;
    ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.0025));
    ctx.strokeStyle = currentColor;
    ctx.strokeRect(startX, startY, w, h);
    tempRect = null;
  }

  drawing = false;
});

// helper — стрелка
function drawArrow(ctx, x1, y1, x2, y2) {
  const headlen = Math.max(8, Math.round(canvas.width * 0.01));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.004));
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
  ctx.lineTo(x2, y2);
  ctx.fillStyle = currentColor;
  ctx.fill();
}

// === Копирование ===
document.getElementById("copyBtn").onclick = () => {
  canvas.toBlob(blob => {
    navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob })
    ]).then(() => {
      alert("Скриншот скопирован в буфер обмена!");
    }).catch(err => {
      console.error("Ошибка копирования:", err);
      alert("Не удалось скопировать в буфер!");
    });
  });
};
