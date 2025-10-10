// offscreen.js — robust recording with system audio + mic (fallbacks)
let mediaRecorder = null;
let chunks = [];
let combinedStream = null;

let _displayStream = null;
let _micStream = null;
let _audioContext = null;

async function startRecording(options = { mic: true, system: true }) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') return;

  chunks = [];
  combinedStream = null;
  _displayStream = null;
  _micStream = null;
  _audioContext = null;

  try {
    // 1) Захват экрана (видео, и если доступно — системный звук)
    try {
      _displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: options.system // если system=false, запрос аудио не делаем
      });
    } catch (err) {
      // если пользователь отменил или system audio не поддерживается — пробуем без audio
      console.warn("Display capture failed with audio option, retrying without audio:", err);
      try {
        _displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      } catch (err2) {
        // если и это не удалось — бросаем ошибку дальше
        console.error("Display capture failed entirely:", err2);
        throw err2;
      }
    }

    // 2) Захват микрофона (если выбран)
    if (options.mic) {
      try {
        _micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn("🎤 Микрофон недоступен или доступ отклонён:", err);
        _micStream = null; // просто продолжаем без микрофона
      }
    }

    // 3) Собираем аудио-треки
    const displayAudioTracks = (_displayStream && _displayStream.getAudioTracks && _displayStream.getAudioTracks()) || [];
    const micAudioTracks = (_micStream && _micStream.getAudioTracks && _micStream.getAudioTracks()) || [];

    // 4) Решаем, как формировать итоговый аудио поток:
    //    - если есть и системный звук и микрофон -> микшируем через AudioContext в один поток
    //    - если есть только один из них -> используем его треки напрямую
    //    - если нет ни одного -> не добавляем аудио дорожек
    let audioTracksToAdd = [];

    if (displayAudioTracks.length > 0 && micAudioTracks.length > 0) {
      // mix them
      _audioContext = new AudioContext();
      const dest = _audioContext.createMediaStreamDestination();

      // создаём источники из отдельных streams (оборачиваем в MediaStream)
      const displaySource = _audioContext.createMediaStreamSource(new MediaStream(displayAudioTracks));
      displaySource.connect(dest);

      const micSource = _audioContext.createMediaStreamSource(new MediaStream(micAudioTracks));
      micSource.connect(dest);

      audioTracksToAdd = dest.stream.getAudioTracks(); // один или несколько треков (обычно 1)
    } else if (displayAudioTracks.length > 0) {
      audioTracksToAdd = displayAudioTracks;
    } else if (micAudioTracks.length > 0) {
      audioTracksToAdd = micAudioTracks;
    } else {
      audioTracksToAdd = [];
    }

    // 5) Собираем итоговый stream: видео из display + выбранные аудио
    const videoTracks = (_displayStream && _displayStream.getVideoTracks && _displayStream.getVideoTracks()) || [];
    const tracks = [...videoTracks, ...audioTracksToAdd];
    combinedStream = new MediaStream(tracks);

    // 6) Подбираем поддерживаемый mimeType (fallback)
    let mimeTypeOptions = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    let mrOptions = {};
    for (const mt of mimeTypeOptions) {
      if (MediaRecorder.isTypeSupported(mt)) {
        mrOptions.mimeType = mt;
        break;
      }
    }

    // 7) Создаём MediaRecorder
    mediaRecorder = new MediaRecorder(combinedStream, mrOptions);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);

        // отправляем в background, чтобы background сохранил или загрузил
        chrome.runtime.sendMessage({ action: 'save-video', url });

        // очистка
        chunks = [];

        // остановим все треки
        if (combinedStream) combinedStream.getTracks().forEach(t => t.stop());
        if (_displayStream) _displayStream.getTracks().forEach(t => t.stop());
        if (_micStream) _micStream.getTracks().forEach(t => t.stop());

        // закрываем audioContext, если был
        if (_audioContext && typeof _audioContext.close === 'function') {
          _audioContext.close().catch(()=>{});
        }

        _displayStream = null;
        _micStream = null;
        _audioContext = null;
        combinedStream = null;
        mediaRecorder = null;
      } catch (err) {
        console.error("Error in onstop cleanup:", err);
      }
    };

    mediaRecorder.onerror = (err) => {
      console.error("MediaRecorder error:", err);
      // опционально отправим ошибку в background
      chrome.runtime.sendMessage({ action: 'recording-error', error: String(err) });
    };

    mediaRecorder.start(1000); // батчи по 1s
    console.log("🎥 Recording started; tracks — video:", videoTracks.length, "audio:", audioTracksToAdd.length);
    chrome.runtime.sendMessage({ action: 'recording-started' });

  } catch (err) {
    console.error("❌ startRecording failed:", err);
    // пытаемся корректно остановить/очистить, если что-то частично создалось
    try { if (_displayStream) _displayStream.getTracks().forEach(t => t.stop()); } catch(e){}
    try { if (_micStream) _micStream.getTracks().forEach(t => t.stop()); } catch(e){}
    try { if (_audioContext) _audioContext.close().catch(()=>{}); } catch(e){}
    _displayStream = null;
    _micStream = null;
    _audioContext = null;
    combinedStream = null;
    mediaRecorder = null;

    // уведомим background/popup о проблеме, чтобы UI мог показать сообщение
    chrome.runtime.sendMessage({ action: 'recording-error', error: (err && (err.message||String(err))) || 'Unknown error' });
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    console.log("🛑 Recording stopped (stop requested)");
    // onstop обработает очистку
  } else {
    // если mediaRecorder нет, всё равно попытаемся почистить
    try { if (_displayStream) _displayStream.getTracks().forEach(t => t.stop()); } catch(e){}
    try { if (_micStream) _micStream.getTracks().forEach(t => t.stop()); } catch(e){}
    if (_audioContext && typeof _audioContext.close === 'function') _audioContext.close().catch(()=>{});
    _displayStream = null; _micStream = null; _audioContext = null; mediaRecorder = null; combinedStream = null;
  }
}

// слушаем сообщения от background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return;
  if (msg.action === 'start') startRecording(msg.options || { mic: true, system: true });
  if (msg.action === 'stop') stopRecording();
});
