// === editor.js ===
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

let currentTool = "pen";
let currentColor = "#ff0000";
let drawing = false;
let startX = 0, startY = 0;
let editorWindowId = null;
let bgImage = new Image();
let imgNaturalWidth = 0, imgNaturalHeight = 0;
let baseImageData = null;
let tempRect = null;
let circleCounter = 1;
let brushSize = 25;
let markerOpacity = 0.1;
let displayScale = 1;

// === Offscreen draw layer ===
let drawLayer = document.createElement("canvas");
let drawCtx = drawLayer.getContext("2d", { willReadFrequently: true });

// === Настройки UI ===
const sizeSlider = document.getElementById("sizeSlider");
const sizeValue = document.getElementById("sizeValue");
const opacitySlider = document.getElementById("opacitySlider");
const opacityValue = document.getElementById("opacityValue");

sizeSlider.addEventListener("input", (e) => {
  brushSize = parseInt(e.target.value);
  sizeValue.textContent = brushSize;
});
opacitySlider.addEventListener("input", (e) => {
  markerOpacity = parseInt(e.target.value) / 100;
  opacityValue.textContent = e.target.value;
});

// === Undo / Redo ===
const undoStack = [];
const redoStack = [];
const actionStack = [];
const redoActionStack = [];

function saveState(type = "generic") {
  const snapshot = drawLayer.toDataURL("image/png");
  undoStack.push(snapshot);
  actionStack.push(type);
  if (undoStack.length > 60) { undoStack.shift(); actionStack.shift(); }
  redoStack.length = 0;
  redoActionStack.length = 0;
}

function restoreState(dataURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
      drawCtx.drawImage(img, 0, 0, drawLayer.width, drawLayer.height);
      redraw();
      resolve();
    };
    img.src = dataURL;
  });
}

async function undo() {
  if (undoStack.length < 2) return;
  const current = undoStack.pop();
  const type = actionStack.pop();
  redoStack.push(current);
  redoActionStack.push(type);
  const prev = undoStack[undoStack.length - 1];
  await restoreState(prev);
  if (type === "circle-number" && circleCounter > 1) circleCounter--;
}

async function redo() {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  const type = redoActionStack.pop();
  undoStack.push(next);
  actionStack.push(type);
  await restoreState(next);
  if (type === "circle-number") circleCounter++;
}

// === Палитра ===
document.getElementById("colorPicker").addEventListener("input", (e) => currentColor = e.target.value);
document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

// === Загрузка изображения ===
chrome.runtime.sendMessage({ action: "request-image" }, (resp) => {
  if (!resp || !resp.url) return;
  editorWindowId = resp.windowId || null;

  bgImage = new Image();
  bgImage.onload = () => {
    imgNaturalWidth = bgImage.naturalWidth;
    imgNaturalHeight = bgImage.naturalHeight;

    // ✅ Всегда рисуем в оригинальном разрешении
    canvas.width = imgNaturalWidth;
    canvas.height = imgNaturalHeight;
    drawLayer.width = imgNaturalWidth;
    drawLayer.height = imgNaturalHeight;

    fitCanvasToWindow();
    drawBaseImage();
    saveState("init");
  };
  bgImage.src = resp.url;
});

// === Масштаб отображения (только CSS, без потери качества) ===
function fitCanvasToWindow() {
  if (!imgNaturalWidth || !imgNaturalHeight) return;
  const imgAspect = imgNaturalWidth / imgNaturalHeight;
  const winAspect = window.innerWidth / (window.innerHeight - 60);
  let displayW, displayH;

  if (winAspect > imgAspect) {
    displayH = window.innerHeight - 60;
    displayW = displayH * imgAspect;
  } else {
    displayW = window.innerWidth;
    displayH = displayW / imgAspect;
  }

  // ✅ Меняем только CSS размеры
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;
}

// === Перерисовка ===
function drawBaseImage() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight);
}
function redraw() {
  drawBaseImage();
  ctx.drawImage(drawLayer, 0, 0);
}

// === Координаты ===
function clientToCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  return { x, y };
}

// === Обработка resize ===
window.addEventListener("resize", () => {
  fitCanvasToWindow();
  redraw();
});

// === Инструменты ===
document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.onclick = () => { currentTool = btn.dataset.tool; };
});

canvas.addEventListener("mousedown", (e) => {
  const pos = clientToCanvasCoords(e);
  drawing = true;
  startX = pos.x;
  startY = pos.y;

  if (currentTool === "text") {
    const text = prompt("Введите текст:");
    if (text) {
      drawCtx.fillStyle = currentColor;
      const fontSize = Math.max(12, Math.round(canvas.width * 0.02));
      drawCtx.font = `${fontSize}px sans-serif`;
      drawCtx.fillText(text, startX, startY);
      saveState("text");
      redraw();
    }
    drawing = false;
  }

  if (["pen", "marker"].includes(currentTool)) {
    drawCtx.beginPath();
    drawCtx.moveTo(startX, startY);
    drawCtx.lineCap = "round";
    drawCtx.globalAlpha = currentTool === "marker" ? markerOpacity : 1.0;
    drawCtx.lineWidth = currentTool === "marker" ? brushSize : brushSize / 2;
    drawCtx.strokeStyle = currentColor;
  }

  if (["rectangle", "crop", "blur"].includes(currentTool)) {
    tempRect = { x: startX, y: startY, w: 0, h: 0 };
    baseImageData = drawCtx.getImageData(0, 0, drawLayer.width, drawLayer.height);
  }

  if (currentTool === "circle-number") {
    drawNumberCircle(drawCtx, startX, startY);
    saveState("circle-number");
    redraw();
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);

  if (["pen", "marker"].includes(currentTool)) {
    drawCtx.lineTo(pos.x, pos.y);
    drawCtx.stroke();
    redraw();
  }

  if (["rectangle", "crop", "blur"].includes(currentTool) && tempRect) {
    const w = pos.x - startX;
    const h = pos.y - startY;
    drawCtx.putImageData(baseImageData, 0, 0);
    drawCtx.lineWidth = 2;
    drawCtx.strokeStyle = currentTool === "blur" ? "#888" : (currentTool === "crop" ? "#00BFFF" : currentColor);
    drawCtx.strokeRect(startX, startY, w, h);
    tempRect = { x: startX, y: startY, w, h };
    redraw();
  }

  if (currentTool === "blur-brush") {
    applyBlurCircle(pos.x, pos.y, brushSize);
    redraw();
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (!drawing) return;
  drawing = false;
  const pos = clientToCanvasCoords(e);

  if (currentTool === "arrow") {
    drawArrow(drawCtx, startX, startY, pos.x, pos.y);
    saveState("arrow");
  } else if (["pen", "marker"].includes(currentTool)) {
    drawCtx.closePath();
    drawCtx.globalAlpha = 1.0;
    saveState("pen");
  } else if (currentTool === "rectangle") {
    drawCtx.lineWidth = 2;
    drawCtx.strokeStyle = currentColor;
    drawCtx.strokeRect(tempRect.x, tempRect.y, tempRect.w, tempRect.h);
    saveState("rect");
  } else if (currentTool === "blur" && tempRect) {
    applyBlurOnce(tempRect);
    saveState("blur");
  }

  tempRect = null;
  redraw();
});

// === Остальные функции ===
function drawArrow(ctx, x1, y1, x2, y2) {
  const headlen = Math.max(8, Math.round(canvas.width * 0.01));
  const dx = x2 - x1, dy = y2 - y1;
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
  ctx.fillStyle = currentColor;
  ctx.fill();
}

function drawNumberCircle(ctx, x, y) {
  const radius = Math.max(14, Math.round(canvas.width * 0.015));
  const number = circleCounter;
  circleCounter = circleCounter >= 99 ? 1 : circleCounter + 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = currentColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff";
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `${radius * 1.2}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(number.toString(), x, y);
}

// === Размытие (исправленное) ===
function applyBlurOnce(rect) {
  const { x, y, w, h } = rect;
  if (!w || !h) return;

  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  const aw = Math.abs(w), ah = Math.abs(h);

  // Создаём временный canvas с фоном + слоями
  const temp = document.createElement("canvas");
  temp.width = imgNaturalWidth;
  temp.height = imgNaturalHeight;
  const tctx = temp.getContext("2d");
  tctx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight);
  tctx.drawImage(drawLayer, 0, 0);

  // Вырезаем нужный участок и применяем размытие
  const blurPiece = document.createElement("canvas");
  blurPiece.width = aw;
  blurPiece.height = ah;
  const bctx = blurPiece.getContext("2d");
  bctx.drawImage(temp, sx, sy, aw, ah, 0, 0, aw, ah);

  drawCtx.save();
  drawCtx.filter = "blur(8px)";
  drawCtx.drawImage(blurPiece, sx, sy);
  drawCtx.restore();

  redraw();
}

function applyBlurCircle(x, y, r) {
  // Тоже комбинируем фон + слой перед размытием
  const temp = document.createElement("canvas");
  temp.width = imgNaturalWidth;
  temp.height = imgNaturalHeight;
  const tctx = temp.getContext("2d");
  tctx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight);
  tctx.drawImage(drawLayer, 0, 0);

  const tempCircle = document.createElement("canvas");
  tempCircle.width = r * 2;
  tempCircle.height = r * 2;
  const cctx = tempCircle.getContext("2d");
  cctx.drawImage(temp, x - r, y - r, r * 2, r * 2, 0, 0, r * 2, r * 2);

  drawCtx.save();
  drawCtx.filter = "blur(6px)";
  drawCtx.beginPath();
  drawCtx.arc(x, y, r, 0, Math.PI * 2);
  drawCtx.clip();
  drawCtx.drawImage(tempCircle, x - r, y - r);
  drawCtx.restore();

  redraw();
}


// === Сохранение ===
document.getElementById("saveBtn").onclick = () => {
  const off = document.createElement("canvas");
  off.width = imgNaturalWidth;
  off.height = imgNaturalHeight;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight);
  offCtx.drawImage(drawLayer, 0, 0);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const filename = `Screenshot_${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.png`;
  const url = off.toDataURL("image/png");
  chrome.runtime.sendMessage({ action: "save-screenshot", url, filename });
};

// === Копировать ===
document.getElementById("copyBtn").onclick = () => {
  canvas.toBlob(blob => {
    navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      .then(() => alert("Скопировано в буфер!"))
      .catch(() => alert("Ошибка копирования"));
  });
};

// === Загрузка в облако (IMGBB) ===
document.getElementById("uploadBtn").onclick = async () => {
  const off = document.createElement("canvas");
  off.width = imgNaturalWidth;
  off.height = imgNaturalHeight;
  const offCtx = off.getContext("2d");
  offCtx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight);
  offCtx.drawImage(drawLayer, 0, 0);

  const dataUrl = off.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const fileName = `Screenshot_${Date.now()}.png`;
  const apiKey = "364c56e69ce9a6479c3f2d9b0f03a979";

  const formData = new FormData();
  formData.append("image", base64);
  formData.append("name", fileName);

  try {
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, { method: "POST", body: formData });
    const json = await res.json();
    if (json.success) {
      const link = json.data.url;
      navigator.clipboard.writeText(link);
      alert(`✅ Ссылка скопирована:\n${link}`);
      window.open(link, "_blank");
    } else alert("Ошибка при загрузке");
  } catch (err) {
    console.error(err);
    alert("Не удалось загрузить скриншот");
  }
};

// === Горячие клавиши ===
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
});
