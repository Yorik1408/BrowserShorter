let mediaRecorder = null;
let chunks = [];
let stream = null;

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return;

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (err) {
    console.error('User denied screen capture', err);
    return;
  }

  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'video/webm' });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.runtime.sendMessage({ action: 'save-video', url: reader.result });
    };
    reader.readAsDataURL(blob);

    // ⚡️ уведомляем background, что запись остановлена
    chrome.runtime.sendMessage({ action: 'recording-stopped' });

    chunks = [];
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
  };

  mediaRecorder.start(1000);
  console.log('Recording started in offscreen');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log('Recording stopped');
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.action === 'start') startRecording();
  if (msg.action === 'stop') stopRecording();
});
