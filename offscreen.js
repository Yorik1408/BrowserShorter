// offscreen.js — выполняет getDisplayMedia, MediaRecorder и пересылает видео в background

let mediaRecorder = null;
let chunks = [];
let stream = null;

async function startRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") return;

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  } catch (err) {
    console.error("User denied screen capture", err);
    // оповестим background, что запись не стартовала
    chrome.runtime.sendMessage({ action: "recording-stopped" });
    return;
  }

  chunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm; codecs=vp9" });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.runtime.sendMessage({ action: "save-video", url: reader.result });
    };
    reader.readAsDataURL(blob);

    // сообщаем, что запись реально остановилась
    chrome.runtime.sendMessage({ action: "recording-stopped" });

    // чистим
    chunks = [];
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    mediaRecorder = null;
  };

  mediaRecorder.start(1000);
  console.log("Recording started in offscreen");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    console.log("Recording stopped in offscreen");
  } else {
    // если mediaRecorder нет — всё равно сообщаем stopped
    chrome.runtime.sendMessage({ action: "recording-stopped" });
  }
}

// слушаем команды от background/popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.action === "start") startRecording();
  if (msg.action === "stop") stopRecording();
});