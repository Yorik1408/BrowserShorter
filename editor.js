// editor.js
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d");
let currentTool = "pen";
let drawing = false;
let startX = 0, startY = 0;
let editorWindowId = null;
let bgImage = new Image(); // исходное изображение (в полном разрешении)

// подгоняем canvas под окно, но реальные пиксели будут заданы при загрузке изображения
function fitCanvasToWindow() {
  // Мы используем CSS для масштабирования канваса на экран.
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = (window.innerHeight - 50) + "px";
}
fitCanvasToWindow();
window.addEventListener("resize", fitCanvasToWindow);

// toolbar
document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.onclick = () => { currentTool = btn.dataset.tool; };
});

// Save: отправляем оригинал (высокое разрешение)
document.getElementById("saveBtn").onclick = () => {
  // Сгенерируем dataURL в полном разрешении
  const url = canvas.toDataURL("image/png");
  chrome.runtime.sendMessage({ action: "save-screenshot", url }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error("Save failed:", chrome.runtime.lastError.message);
      return;
    }
    // при положительном ответе можно закрыть окно (background отвечает ok)
    if (resp && resp.ok) {
      // попробуем закрыть через request к background (он знает windowId)
      chrome.runtime.sendMessage({ action: "request-image" }, (r) => {
        const winId = r && r.windowId;
        if (winId) chrome.windows.remove(winId);
        else window.close();
      });
    }
  });
};

// Upload button (если есть) просто вызывает сохранение/загрузку через background
const uploadBtn = document.getElementById("uploadBtn");
if (uploadBtn) {
  uploadBtn.onclick = () => {
    const url = canvas.toDataURL("image/png");
    chrome.runtime.sendMessage({ action: "save-screenshot", url });
  };
}

// При загрузке редактора спрашиваем у background картинку
chrome.runtime.sendMessage({ action: "request-image" }, (resp) => {
  if (!resp || !resp.url) return;
  editorWindowId = resp.windowId || null;
  bgImage = new Image();
  bgImage.onload = () => {
    // Устанавливаем canvas в реальные пиксели изображения
    canvas.width = bgImage.naturalWidth;
    canvas.height = bgImage.naturalHeight;
    // CSS разметка уже масштабирует canvas для окна; здесь рисуем в реальном разрешении
    ctx.drawImage(bgImage, 0, 0);
    // установим стили, чтобы canvas подогнался по экрану
    canvas.style.maxWidth = "100%";
    canvas.style.maxHeight = "calc(100% - 50px)";
  };
  bgImage.src = resp.url;
});

// Вспомогательная конвертация координат мыши в координаты canvas (учитывает CSS масштаб)
function clientToCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

// Мыши для рисования
canvas.addEventListener("mousedown", (e) => {
  const pos = clientToCanvasCoords(e);
  drawing = true;
  startX = pos.x;
  startY = pos.y;

  if (currentTool === "text") {
    const text = prompt("Enter text:");
    if (text) {
      ctx.fillStyle = "red";
      // font size in px relative to image resolution
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
    ctx.strokeStyle = "red";
    ctx.lineCap = "round";
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);
  if (currentTool === "pen") {
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);
  if (currentTool === "arrow") {
    drawArrow(ctx, startX, startY, pos.x, pos.y);
  } else if (currentTool === "pen") {
    // завершено
    ctx.closePath();
  }
  drawing = false;
});

// helper arrow
function drawArrow(ctx, x1, y1, x2, y2) {
  const headlen = Math.max(8, Math.round(canvas.width * 0.01));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  ctx.strokeStyle = "red";
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
  ctx.fillStyle = "red";
  ctx.fill();
}
