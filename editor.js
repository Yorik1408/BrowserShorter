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

// === Offscreen draw layer для всех набросков ===
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
  const snapshot = drawCtx.getImageData(0, 0, drawLayer.width, drawLayer.height);
  undoStack.push(snapshot);
  actionStack.push(type);
  if (undoStack.length > 60) { undoStack.shift(); actionStack.shift(); }
  redoStack.length = 0;
  redoActionStack.length = 0;
}

function undo() {
  if (undoStack.length < 2) return;
  const current = undoStack.pop();
  const type = actionStack.pop();
  redoStack.push(current);
  redoActionStack.push(type);
  const prev = undoStack[undoStack.length - 1];
  drawCtx.putImageData(prev, 0, 0);
  if (type === "circle-number" && circleCounter > 1) circleCounter--;
  redraw();
}

function redo() {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  const type = redoActionStack.pop();
  undoStack.push(next);
  actionStack.push(type);
  drawCtx.putImageData(next, 0, 0);
  if (type === "circle-number") circleCounter++;
  redraw();
}

// === Палитра ===
document.getElementById("colorPicker").addEventListener("input", (e) => currentColor = e.target.value);
document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

// === Helper для DPR ===
function getDPR() { return window.devicePixelRatio || 1; }

// === Загрузка изображения ===
chrome.runtime.sendMessage({ action: "request-image" }, (resp) => {
  if (!resp || !resp.url) return;
  editorWindowId = resp.windowId || null;

  bgImage = new Image();
  bgImage.onload = () => {
    imgNaturalWidth = bgImage.naturalWidth;
    imgNaturalHeight = bgImage.naturalHeight;
    fitCanvasToWindow();
    drawBaseImage();
    drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
    saveState("init");
  };
  bgImage.src = resp.url;
});

// === Настройка канваса под окно (в device pixels) ===
function fitCanvasToWindow() {
  if (!imgNaturalWidth || !imgNaturalHeight) return;
  const dpr = getDPR();
  const imgAspect = imgNaturalWidth / imgNaturalHeight;
  const availW = window.innerWidth;
  const availH = Math.max(100, window.innerHeight - 60);
  const winAspect = availW / availH;
  let displayW, displayH;

  if (winAspect > imgAspect) {
    displayH = availH;
    displayW = displayH * imgAspect;
  } else {
    displayW = availW;
    displayH = displayW / imgAspect;
  }

  canvas.width = Math.round(displayW * dpr);
  canvas.height = Math.round(displayH * dpr);
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  drawLayer.width = canvas.width;
  drawLayer.height = canvas.height;

  displayScale = canvas.width / imgNaturalWidth;

  [ctx, drawCtx].forEach(c => {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
  });
}

// === Сохранение и восстановление слоя при ресайзе ===
async function saveDrawLayerSnapshot() {
  try {
    return await createImageBitmap(drawLayer);
  } catch {
    const tmp = document.createElement("canvas");
    tmp.width = drawLayer.width; tmp.height = drawLayer.height;
    tmp.getContext("2d").drawImage(drawLayer, 0, 0);
    return tmp;
  }
}
function restoreDrawLayerSnapshot(snapshot) {
  drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
  drawCtx.drawImage(snapshot, 0, 0, drawLayer.width, drawLayer.height);
}

// === Перерисовка ===
function drawBaseImage() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight, 0, 0, canvas.width, canvas.height);
}
function redraw() {
  drawBaseImage();
  ctx.drawImage(drawLayer, 0, 0);
}

// === Resize handler ===
let resizeTimeout;
window.addEventListener("resize", () => {
  if (!imgNaturalWidth) return;
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(async () => {
    const snap = await saveDrawLayerSnapshot();
    fitCanvasToWindow();
    drawBaseImage();
    if (snap) restoreDrawLayerSnapshot(snap);
    redraw();
  }, 150);
});

// === Координаты ===
function clientToCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * drawLayer.width;
  const y = ((e.clientY - rect.top) / rect.height) * drawLayer.height;
  return { x, y };
}

// === Инструменты ===
document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.onclick = () => { currentTool = btn.dataset.tool; };
});

let tempBlur = null;

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
  } else if (currentTool === "crop" && tempRect) {
    performCrop(tempRect);
  } else if (currentTool === "blur" && tempRect) {
    applyBlurOnce(tempRect);
    saveState("blur");
  } else if (currentTool === "blur-brush") {
    saveState("blur-brush");
  }

  tempRect = null;
  redraw();
});

// === Инструменты ===
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

// === Размытие ===
function applyBlurOnce(rect) {
  const { x, y, w, h } = rect;
  if (!w || !h) return;
  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  const aw = Math.abs(w), ah = Math.abs(h);
  const temp = document.createElement("canvas");
  temp.width = aw; temp.height = ah;
  const tctx = temp.getContext("2d");
  tctx.drawImage(drawLayer, sx, sy, aw, ah, 0, 0, aw, ah);
  drawCtx.save();
  drawCtx.filter = "blur(6px)";
  drawCtx.drawImage(temp, sx, sy);
  drawCtx.restore();
}

function applyBlurCircle(x, y, r) {
  const temp = document.createElement("canvas");
  temp.width = r * 2; temp.height = r * 2;
  const tctx = temp.getContext("2d");
  tctx.drawImage(drawLayer, x - r, y - r, r * 2, r * 2, 0, 0, r * 2, r * 2);
  drawCtx.save();
  drawCtx.filter = "blur(5px)";
  drawCtx.beginPath();
  drawCtx.arc(x, y, r, 0, Math.PI * 2);
  drawCtx.clip();
  drawCtx.drawImage(temp, x - r, y - r);
  drawCtx.restore();
}

// === Обрезка ===
function performCrop(rect) {
  const { x, y, w, h } = rect;
  if (!w || !h) return;
  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  const aw = Math.abs(w), ah = Math.abs(h);
  const crop = drawCtx.getImageData(sx, sy, aw, ah);
  imgNaturalWidth = aw;
  imgNaturalHeight = ah;
  fitCanvasToWindow();
  drawCtx.putImageData(crop, 0, 0);
  saveState("crop");
  redraw();
}

// === Сохранение ===
document.getElementById("saveBtn").onclick = () => {
  const off = document.createElement("canvas");
  off.width = imgNaturalWidth;
  off.height = imgNaturalHeight;
  const offCtx = off.getContext("2d");
  offCtx.imageSmoothingEnabled = true;
  offCtx.imageSmoothingQuality = "high";
  offCtx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight);
  offCtx.drawImage(drawLayer, 0, 0, drawLayer.width, drawLayer.height, 0, 0, imgNaturalWidth, imgNaturalHeight);

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

// === Горячие клавиши ===
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault(); undo();
  } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
    e.preventDefault(); redo();
  }
});
