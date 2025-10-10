document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("start-recording");
  const stopBtn = document.getElementById("stop-recording");
  const statusEl = document.getElementById("status");
  const shotTabBtn = document.getElementById("screenshot-tab");
  const shotAreaBtn = document.getElementById("screenshot-area");

  function setUIRecording(isRec) {
    startBtn.disabled = !!isRec;
    stopBtn.disabled = !isRec;
    statusEl.textContent = isRec ? "🔴 Идет запись" : "⏸ Начать запись";
  }

  // при открытии popup получаем статус
  chrome.runtime.sendMessage({ action: "get-status" }, (res) => {
    if (res && typeof res.isRecording === "boolean") setUIRecording(res.isRecording);
  });

  // Нажали Start -> просим background создать offscreen и стартовать запись
  startBtn.onclick = async () => {
    const res = await chrome.runtime.sendMessage({ action: "start-recording" }).catch(() => null);
    setUIRecording(true);
  };

  // Нажали Stop -> просто шлем стоп (не создаём offscreen!)
  stopBtn.onclick = async () => {
    await chrome.runtime.sendMessage({ action: "stop-recording" }).catch(() => null);
    setUIRecording(false);
  };

  shotTabBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: "take-screenshot-tab" });
  };

  // Для области посылаем команду в background — background гарантирует доставку в content script
  shotAreaBtn.onclick = () => {
    chrome.runtime.sendMessage({ action: "start-area-selection" });
  };

  // слушаем событие о том, что запись остановлена извне
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "recording-stopped") setUIRecording(false);
  });
});