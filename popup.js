document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-recording");
  const stopBtn = document.getElementById("stop-recording");
  const statusEl = document.getElementById("status");
  const shotTabBtn = document.getElementById("screenshot-tab");
  const shotAreaBtn = document.getElementById("screenshot-area");
  const micChk = document.getElementById("record-mic");
  const sysChk = document.getElementById("record-system");

  function setUIRecording(isRec) {
    startBtn.disabled = !!isRec;
    stopBtn.disabled = !isRec;
    statusEl.textContent = isRec ? "🔴 Идет запись" : "⏸ Начать запись";
  }

  // при открытии popup получаем статус
  chrome.runtime.sendMessage({ action: "get-status" }, (res) => {
    if (res && typeof res.isRecording === "boolean") setUIRecording(res.isRecording);
  });

  startBtn.onclick = async () => {
    const options = {
      mic: micChk.checked,
      system: sysChk.checked
    };
    await chrome.runtime.sendMessage({ action: "start-recording", options }).catch(() => null);
    setUIRecording(true);
  };

  stopBtn.onclick = async () => {
    await chrome.runtime.sendMessage({ action: "stop-recording" }).catch(() => null);
    setUIRecording(false);
  };

  shotTabBtn.onclick = () => chrome.runtime.sendMessage({ action: "take-screenshot-tab" });
  shotAreaBtn.onclick = () => chrome.runtime.sendMessage({ action: "start-area-selection" });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "recording-stopped") setUIRecording(false);
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.action === 'recording-error') {
      alert("Ошибка записи: " + (msg.error || "Unknown"));
      setUIRecording(false);
    }
    if (msg.action === 'recording-started') {
      setUIRecording(true);
    }
  });
});
