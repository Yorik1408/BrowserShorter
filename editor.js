let canvas = document.getElementById("editorCanvas");
let ctx = canvas.getContext("2d");
let currentTool = "pen";
let drawing = false;
let startX = 0, startY = 0;
let image = new Image();

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 50;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// toolbar
document.querySelectorAll("#toolbar button[data-tool]").forEach(btn => {
  btn.onclick = () => { currentTool = btn.dataset.tool; };
});

// сохранить
document.getElementById("saveBtn").onclick = () => {
  const dataUrl = canvas.toDataURL("image/png");
  chrome.runtime.sendMessage({ action: "save-screenshot", url: dataUrl }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Save screenshot failed:", chrome.runtime.lastError.message);
      return;
    }
    console.log("Screenshot saved!");
    // закрыть текущее окно редактора
    chrome.windows.getCurrent((win) => {
      chrome.windows.remove(win.id);
    });
  });
};


// получить скриншот из URL
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "load-screenshot" && msg.url) {
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = msg.url;
  }
});

// мышь
canvas.onmousedown = (e) => {
  drawing = true;
  startX = e.offsetX;
  startY = e.offsetY;
  if (currentTool === "text") {
    const text = prompt("Enter text:");
    if (text) {
      ctx.fillStyle = "red";
      ctx.font = "20px Arial";
      ctx.fillText(text, startX, startY);
    }
    drawing = false;
  }
};

canvas.onmousemove = (e) => {
  if (!drawing) return;
  ctx.strokeStyle = "red";
  ctx.lineWidth = 2;
  if (currentTool === "pen") {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();
    startX = e.offsetX;
    startY = e.offsetY;
  }
};

canvas.onmouseup = (e) => {
  if (!drawing) return;
  if (currentTool === "arrow") {
    drawArrow(ctx, startX, startY, e.offsetX, e.offsetY);
  }
  drawing = false;
};

// arrow helper
function drawArrow(ctx, fromX, fromY, toX, toY) {
  const headlen = 10;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI/6), toY - headlen * Math.sin(angle - Math.PI/6));
  ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI/6), toY - headlen * Math.sin(angle + Math.PI/6));
  ctx.lineTo(toX, toY);
  ctx.fillStyle = "red";
  ctx.fill();
}
