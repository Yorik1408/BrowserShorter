let tool = 'line';
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas(img) {
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
}

document.getElementById('line').onclick = () => tool='line';
document.getElementById('arrow').onclick = () => tool='arrow';
document.getElementById('rect').onclick = () => tool='rect';
document.getElementById('text').onclick = () => tool='text';
document.getElementById('save').onclick = () => {
  const url = canvas.toDataURL('image/png');
  chrome.runtime.sendMessage({ action: 'save-edited-screenshot', url });
};

let startX, startY, drawing = false;

canvas.onmousedown = (e) => {
  startX = e.offsetX;
  startY = e.offsetY;
  drawing = true;
};

canvas.onmousemove = (e) => {
  if (!drawing) return;
  const x = e.offsetX;
  const y = e.offsetY;

  // redraw original image first
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(originalImg, 0, 0);

  ctx.strokeStyle = 'red';
  ctx.lineWidth = 3;

  if (tool === 'line') {
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(x, y);
    ctx.stroke();
  } else if (tool === 'rect') {
    ctx.strokeRect(startX, startY, x-startX, y-startY);
  } else if (tool === 'arrow') {
    drawArrow(startX, startY, x, y);
  }
};

canvas.onmouseup = (e) => {
  drawing = false;
};

function drawArrow(x1, y1, x2, y2) {
  const headlen = 10;
  const dx = x2-x1;
  const dy = y2-y1;
  const angle = Math.atan2(dy, dx);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI/6), y2 - headlen * Math.sin(angle - Math.PI/6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI/6), y2 - headlen * Math.sin(angle + Math.PI/6));
  ctx.stroke();
}

let originalImg = new Image();
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'open-editor' && msg.dataUrl) {
    originalImg.src = msg.dataUrl;
    originalImg.onload = () => resizeCanvas(originalImg);
  }
});
