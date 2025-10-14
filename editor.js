// editor.js
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

const undoStack = [];
const redoStack = [];
const actionStack = [];
const redoActionStack = [];

// === Undo / Redo ===
function saveState(type = 'generic') {
  const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  undoStack.push(snapshot);
  actionStack.push(type);
  if (undoStack.length > 60) { undoStack.shift(); actionStack.shift(); }
  redoStack.length = 0;
  redoActionStack.length = 0;
}

function undo() {
  if (undoStack.length < 2) return;
  const current = undoStack.pop();
  const currentAction = actionStack.pop();
  redoStack.push(current);
  redoActionStack.push(currentAction);
  const prev = undoStack[undoStack.length - 1];
  ctx.putImageData(prev, 0, 0);
  if (currentAction === 'circle-number' && circleCounter > 1) circleCounter--;
  baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function redo() {
  if (!redoStack.length) return;
  const next = redoStack.pop();
  const nextAction = redoActionStack.pop();
  undoStack.push(next);
  actionStack.push(nextAction);
  ctx.putImageData(next, 0, 0);
  if (nextAction === 'circle-number') circleCounter++;
  baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
    resizeCanvasToFit();
    drawBaseImage();
    saveState('init');
  };
  bgImage.src = resp.url;
});

// === Масштабирование Canvas под окно ===
function resizeCanvasToFit() {
  if (!imgNaturalWidth || !imgNaturalHeight) return;

  const imgAspect = imgNaturalWidth / imgNaturalHeight;
  const windowAspect = window.innerWidth / (window.innerHeight - 50);
  let displayWidth, displayHeight;

  if (windowAspect > imgAspect) {
    displayHeight = window.innerHeight - 50;
    displayWidth = displayHeight * imgAspect;
  } else {
    displayWidth = window.innerWidth;
    displayHeight = displayWidth / imgAspect;
  }

  canvas.width = displayWidth * window.devicePixelRatio;
  canvas.height = displayHeight * window.devicePixelRatio;
  canvas.style.width = displayWidth + "px";
  canvas.style.height = displayHeight + "px";

  displayScale = canvas.width / imgNaturalWidth;
  ctx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
}

function drawBaseImage() {
  ctx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
  ctx.clearRect(0, 0, imgNaturalWidth, imgNaturalHeight);
  ctx.drawImage(bgImage, 0, 0, imgNaturalWidth, imgNaturalHeight);
  baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

window.addEventListener("resize", () => {
  if (!imgNaturalWidth) return;
  resizeCanvasToFit();
  drawBaseImage();
});

// === Конвертация координат ===
function clientToCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * imgNaturalWidth;
  const y = ((e.clientY - rect.top) / rect.height) * imgNaturalHeight;
  return { x, y };
}

// === Инструменты ===
document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.onclick = () => { currentTool = btn.dataset.tool; };
});

let blurRadius = brushSize;

canvas.addEventListener("mousedown", (e) => {
  const pos = clientToCanvasCoords(e);
  drawing = true;
  startX = pos.x;
  startY = pos.y;

  if (["blur", "blur-brush"].includes(currentTool)) {
    saveState('blur');
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  if (currentTool === "text") {
    const text = prompt("Введите текст:");
    if (text) {
      ctx.fillStyle = currentColor;
      const fontSize = Math.max(12, Math.round(canvas.width * 0.02));
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillText(text, startX, startY);
      saveState('text');
    }
    drawing = false;
  }

  if (["pen", "marker"].includes(currentTool)) {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineCap = "round";
    ctx.globalAlpha = currentTool === "marker" ? markerOpacity : 1.0;
    ctx.lineWidth = currentTool === "marker" ? brushSize : brushSize / 2;
    ctx.strokeStyle = currentColor;
  }

  if (["rectangle", "crop", "blur"].includes(currentTool)) {
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    tempRect = { x: startX, y: startY, w: 0, h: 0 };
  }

  if (currentTool === "circle-number") {
    drawNumberCircle(startX, startY);
    saveState('circle-number');
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);

  if (["pen", "marker"].includes(currentTool)) {
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  if (["rectangle", "crop", "blur"].includes(currentTool) && tempRect) {
    const w = pos.x - startX;
    const h = pos.y - startY;
    ctx.putImageData(baseImageData, 0, 0);
    ctx.lineWidth = 2;
    ctx.strokeStyle = currentTool === "blur" ? "#888" : (currentTool === "crop" ? "#00BFFF" : currentColor);
    ctx.strokeRect(startX, startY, w, h);
    tempRect = { x: startX, y: startY, w, h };
  }

  if (currentTool === "blur-brush") {
    applyBlurCircle(pos.x, pos.y, brushSize);
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (!drawing) return;
  drawing = false;
  const pos = clientToCanvasCoords(e);

  if (currentTool === "arrow") {
    drawArrow(ctx, startX, startY, pos.x, pos.y);
    saveState('arrow');
  } else if (["pen", "marker"].includes(currentTool)) {
    ctx.closePath();
    ctx.globalAlpha = 1.0;
    saveState('pen');
  } else if (currentTool === "rectangle") {
    ctx.lineWidth = 2;
    ctx.strokeStyle = currentColor;
    ctx.strokeRect(tempRect.x, tempRect.y, tempRect.w, tempRect.h);
    saveState('rect');
  } else if (currentTool === "crop" && tempRect) {
    performCrop(tempRect);
  } else if (currentTool === "blur" && tempRect) {
    applyBlurOnce(tempRect);
    saveState('blur');
  } else if (currentTool === "blur-brush") {
    saveState('blur-brush');
  }

  baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tempRect = null;
});

// === Размытие ===
function applyBlurOnce(rect) {
  const { x, y, w, h } = rect;
  if (w === 0 || h === 0) return;
  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  const aw = Math.abs(w), ah = Math.abs(h);
  const tempCanvas = document.createElement("canvas");
  const tCtx = tempCanvas.getContext("2d");
  tempCanvas.width = aw;
  tempCanvas.height = ah;
  tCtx.drawImage(canvas, sx, sy, aw, ah, 0, 0, aw, ah);
  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.drawImage(tempCanvas, sx, sy);
  ctx.restore();
}

function applyBlurCircle(x, y, radius) {
  const tempCanvas = document.createElement("canvas");
  const tCtx = tempCanvas.getContext("2d");
  tempCanvas.width = radius * 2;
  tempCanvas.height = radius * 2;
  tCtx.drawImage(canvas, x - radius, y - radius, radius * 2, radius * 2, 0, 0, radius * 2, radius * 2);
  ctx.save();
  ctx.filter = "blur(5px)";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(tempCanvas, x - radius, y - radius);
  ctx.restore();
}

// === Обрезка ===
function performCrop(rect) {
  const { x, y, w, h } = rect;
  if (w === 0 || h === 0) return;
  const sx = w < 0 ? x + w : x;
  const sy = h < 0 ? y + h : y;
  const aw = Math.abs(w), ah = Math.abs(h);
  saveState('crop');
  const imageData = ctx.getImageData(sx, sy, aw, ah);
  imgNaturalWidth = aw;
  imgNaturalHeight = ah;
  canvas.width = aw * window.devicePixelRatio;
  canvas.height = ah * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  ctx.putImageData(imageData, 0, 0);
  baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// === Остальные инструменты ===
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

function drawNumberCircle(x, y) {
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

// === Сохранить и копировать ===
document.getElementById("saveBtn").onclick = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const fileName = `Screenshot_${timestamp}.png`;
  const url = canvas.toDataURL("image/png");
  chrome.runtime.sendMessage({ action: "save-screenshot", url, filename: fileName });
};

document.getElementById("copyBtn").onclick = () => {
  canvas.toBlob(blob => {
    navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])
      .then(() => alert("Скриншот скопирован в буфер обмена!"))
      .catch(() => alert("Не удалось скопировать в буфер!"));
  });
};

// === Горячие клавиши Undo / Redo ===
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
