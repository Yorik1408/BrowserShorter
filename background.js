let isRecording = false;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'start-recording') {
    isRecording = true;
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'start' });
  }

  if (msg.action === 'stop-recording') {
    isRecording = false;
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' });
  }

  if (msg.action === 'recording-stopped') {
    isRecording = false;
    chrome.runtime.sendMessage({ action: 'recording-stopped' });
  }

  if (msg.action === 'save-video' && msg.url) {
    chrome.downloads.download({
      url: msg.url,
      filename: 'recording.webm'
    });
  }

  if (msg.action === 'get-status') {
    sendResponse({ isRecording });
  }

  // ⚡️ Новый блок — сохранение скриншотов
  if (msg.action === 'take-screenshot') {
    chrome.windows.getCurrent({ populate: false }, (win) => {
      chrome.tabs.captureVisibleTab(win.id, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          console.error('Screenshot failed:', chrome.runtime.lastError?.message || 'Unknown error');
          return;
        }
        chrome.downloads.download({
          url: dataUrl,
          filename: `screenshot-${Date.now()}.png`
        });
      });
    });
  }

  return true;
});
