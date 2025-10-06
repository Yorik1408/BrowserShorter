const startBtn = document.getElementById('start');
const stopBtn  = document.getElementById('stop');
const shotBtn  = document.getElementById('screenshot');
const statusEl = document.getElementById('status');

function updateUI(isRecording) {
  if (isRecording) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = '🔴 Recording';
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusEl.textContent = '⏸ Ready';
  }
}

// При открытии popup сразу узнаем статус
chrome.runtime.sendMessage({ action: 'get-status' }, (res) => {
  if (res) updateUI(res.isRecording);
});

startBtn.onclick = async () => {
  if (!await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Screen recording in background'
    });
  }
  chrome.runtime.sendMessage({ action: 'start-recording' });
  updateUI(true);
};

stopBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: 'stop-recording' });
  updateUI(false);
};

shotBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: 'take-screenshot' });
};

// ⚡️ слушаем события от background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'recording-stopped') {
    updateUI(false);
  }
});
