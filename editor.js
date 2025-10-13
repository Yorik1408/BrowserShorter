// editor.js
const canvas = document.getElementById("editorCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

let currentTool = "pen";
let currentColor = "#ff0000";
let drawing = false;
let startX = 0, startY = 0;
let editorWindowId = null;
let bgImage = new Image();
let baseImageData = null;
let tempRect = null;
let circleCounter = 1; // счётчик для кругов с номерами

const undoStack = [];
const redoStack = [];

function saveState() {
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (undoStack.length === 0) return;
  const last = undoStack.pop();
  redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  ctx.putImageData(last, 0, 0);
  baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function redo() {
  if (redoStack.length === 0) return;
  const next = redoStack.pop();
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  ctx.putImageData(next, 0, 0);
  baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// === Палитра ===
const colorPicker = document.getElementById("colorPicker");
colorPicker.addEventListener("input", (e) => {
  currentColor = e.target.value;
});

document.getElementById("undoBtn").onclick = undo;
document.getElementById("redoBtn").onclick = redo;

function fitCanvasToWindow() {
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = (window.innerHeight - 50) + "px";
}
fitCanvasToWindow();
window.addEventListener("resize", fitCanvasToWindow);

document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.onclick = () => { currentTool = btn.dataset.tool; };
});

document.getElementById("saveBtn").onclick = () => {
  const url = canvas.toDataURL("image/png");
  chrome.runtime.sendMessage({ action: "save-screenshot", url });
};

chrome.runtime.sendMessage({ action: "request-image" }, (resp) => {
  if (!resp || !resp.url) return;
  editorWindowId = resp.windowId || null;
  bgImage = new Image();
  bgImage.onload = () => {
    canvas.width = bgImage.naturalWidth;
    canvas.height = bgImage.naturalHeight;
    ctx.drawImage(bgImage, 0, 0);
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    saveState();
  };
  bgImage.src = resp.url;
});

function clientToCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

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
      saveState();
    }
    drawing = false;
  }

  if (currentTool === "pen" || currentTool === "marker") {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineCap = "round";
    if (currentTool === "pen") {
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = Math.max(1, Math.round(canvas.width * 0.0025));
      ctx.strokeStyle = currentColor;
    } else {
      ctx.globalAlpha = 0.01;
      ctx.lineWidth = Math.max(12, Math.round(canvas.width * 0.01));
      ctx.strokeStyle = currentColor === "#ff0000" ? "#FFD500" : currentColor;
    }
  }

  if (currentTool === "rectangle") {
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    tempRect = { x: startX, y: startY, w: 0, h: 0 };
  }

  // === новый инструмент: круг с цифрой ===
  if (currentTool === "circle-number") {
    drawNumberCircle(pos.x, pos.y);
    saveState();
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);

  if (currentTool === "pen" || currentTool === "marker") {
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  if (currentTool === "rectangle" && tempRect) {
    const w = pos.x - startX;
    const h = pos.y - startY;
    ctx.putImageData(baseImageData, 0, 0);
    ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.0025));
    ctx.strokeStyle = currentColor;
    ctx.strokeRect(startX, startY, w, h);
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (!drawing) return;
  const pos = clientToCanvasCoords(e);

  if (currentTool === "arrow") {
    drawArrow(ctx, startX, startY, pos.x, pos.y);
    saveState();
  } else if (currentTool === "pen" || currentTool === "marker") {
    ctx.closePath();
    ctx.globalAlpha = 1.0;
    saveState();
  } else if (currentTool === "rectangle") {
    const w = pos.x - startX;
    const h = pos.y - startY;
    ctx.lineWidth = Math.max(2, Math.round(canvas.width * 0.0025));
    ctx.strokeStyle = currentColor;
    ctx.strokeRect(startX, startY, w, h);
    tempRect = null;
    baseImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    saveState();
  }

  drawing = false;
});

// === стрелка ===
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

// === круг с номером ===
function drawNumberCircle(x, y) {
  const radius = Math.max(14, Math.round(canvas.width * 0.015));
  const number = circleCounter;
  circleCounter = circleCounter >= 99 ? 1 : circleCounter + 1;

  // круг
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = currentColor;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff";
  ctx.stroke();

  // цифра
  ctx.fillStyle = "#fff";
  ctx.font = `${radius * 1.2}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(number.toString(), x, y);
}

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
