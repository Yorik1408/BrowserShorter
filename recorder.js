const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const closeBtn = document.getElementById('close');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

let recorder = null;
let chunks = [];
let mediaStream = null;

function log(msg) {
  console.log(msg);
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

function parseQuery() {
  const params = new URLSearchParams(location.search);
  return {
    tabId: params.get('tabId') ? Number(params.get('tabId')) : null,
    autoStart: params.get('start') === '1'
  };
}

async function getMediaForTab(tabId) {
  // Попробуем сначала современный путь: getMediaStreamId -> getUserMedia
  try {
    if (chrome.tabCapture && chrome.tabCapture.getMediaStreamId) {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
      if (streamId) {
        const constraints = {
          audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
          video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }
        };
        return await navigator.mediaDevices.getUserMedia(constraints);
      }
    }
  } catch (err) {
    log('getMediaStreamId failed: ' + (err && err.message ? err.message : err));
  }

  // Фоллбек: chrome.tabCapture.capture (работает в страницах расширения/popup),
  // возвращает сразу stream в callback.
  if (chrome.tabCapture && chrome.tabCapture.capture) {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.capture({ audio: true, video: true }, (s) => {
        if (!s) {
          reject(chrome.runtime.lastError || new Error('tabCapture.capture returned no stream'));
        } else {
          resolve(s);
        }
      });
    });
  }

  throw new Error('Tab capture API not available');
}

async function startRecording(tabId) {
  if (recorder && recorder.state !== 'inactive') {
    log('Already recording');
    return;
  }
  statusEl.textContent = 'Подключение...';
  log(`Запуск записи для tabId=${tabId}`);

  try {
    mediaStream = await getMediaForTab(tabId);

    // Подключаем захваченное аудио к выходу, чтобы пользователь продолжал слышать звук
    try {
      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(mediaStream);
      src.connect(audioCtx.destination);
    } catch (e) {
      log('AudioContext playback unavailable: ' + e.message);
    }

    recorder = new MediaRecorder(mediaStream, { mimeType: 'video/webm; codecs=vp9' });
    chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const fname = `recording-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        chrome.downloads.download({ url, filename: fname }, (dlId) => {
          if (chrome.runtime.lastError) {
            log('download error: ' + chrome.runtime.lastError.message);
          } else {
            log('Скачивание начато, id=' + dlId + ' → ' + fname);
          }
          // Освободим URL чуть позже
          setTimeout(() => URL.revokeObjectURL(url), 15000);
        });
      } catch (e) {
        log('onstop error: ' + e.message);
      } finally {
        chunks = [];
        statusEl.textContent = '⏸ Остановлено';
      }
    };

    recorder.start(1000); // отдаём чанки каждую секунду
    statusEl.textContent = '🔴 Запись';
    startBtn.disabled = true;
    stopBtn.disabled = false;
    log('Recording started');
  } catch (err) {
    log('Start failed: ' + (err && err.message ? err.message : err));
    statusEl.textContent = 'Ошибка: ' + (err && err.message ? err.message : 'unknown');
  }
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
    log('Recording stopped by user');
  }
  try {
    // Закроем MediaStream tracks
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
  } catch (e) { /* ignore */ }

  startBtn.disabled = false;
  stopBtn.disabled = true;
}

// Обработка входящих сообщений (stop команды от background/popup)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target === 'recorder') {
    if (msg.action === 'stop') stopRecording();
  }
});

startBtn.onclick = async () => {
  const { tabId } = parseQuery();
  if (!tabId) {
    log('Нет tabId в query — попробуй запустить из popup, когда активна целевая вкладка.');
    statusEl.textContent = 'Ошибка: нет tabId';
    return;
  }
  await startRecording(tabId);
};

stopBtn.onclick = () => {
  stopRecording();
};

closeBtn.onclick = () => {
  // Сообщим background, что мы закрываемся (опционально)
  chrome.runtime.sendMessage({ type: 'recorder-closed' });
  window.close();
};

// Авто-старт, если в query передали start=1
(async function init() {
  const { tabId, autoStart } = parseQuery();
  log('Recorder page loaded. tabId=' + tabId + ' autoStart=' + autoStart);
  if (autoStart && tabId) {
    // Небольшая задержка, чтобы background успел создать окно/настроить
    setTimeout(() => startRecording(tabId), 200);
  }
})();
