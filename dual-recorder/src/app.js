import { DualRecorder } from './dualRecorder.js';

const $ = (id) => document.getElementById(id);
const els = {
  status: $('status'),
  source: $('source'),
  canvases: { landscape: $('canvas-landscape'), portrait: $('canvas-portrait') },
  btnCamera: $('btn-camera'),
  btnPhoto: $('btn-photo'),
  btnRecord: $('btn-record'),
  timer: $('timer'),
  downloads: $('downloads'),
  links: $('download-links'),
};

const recorder = new DualRecorder({ sourceVideo: els.source, canvases: els.canvases });
let timerId = null;
let objectUrls = [];

function setStatus(text) {
  els.status.textContent = text;
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.textContent = name;
  return a;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function extFor(blob) {
  return blob.type.includes('mp4') ? 'mp4' : 'webm';
}

els.btnCamera.addEventListener('click', async () => {
  if (recorder.stream) {
    recorder.close();
    els.btnCamera.textContent = 'Start camera';
    els.btnPhoto.disabled = true;
    els.btnRecord.disabled = true;
    setStatus('Camera off');
    return;
  }
  try {
    setStatus('Requesting camera...');
    await recorder.open();
    els.btnCamera.textContent = 'Stop camera';
    els.btnPhoto.disabled = false;
    els.btnRecord.disabled = false;
    setStatus('Ready. Both orientations record together.');
  } catch (err) {
    setStatus(`Camera error: ${err.message}`);
  }
});

els.btnRecord.addEventListener('click', async () => {
  if (!recorder.recording) {
    try {
      recorder.startRecording();
    } catch (err) {
      setStatus(`Could not start: ${err.message}`);
      return;
    }
    els.btnRecord.classList.add('is-recording');
    els.btnRecord.setAttribute('aria-label', 'Stop recording');
    els.btnPhoto.disabled = true;
    els.timer.textContent = '00:00';
    timerId = setInterval(() => {
      els.timer.textContent = formatTime(recorder.elapsedSeconds());
    }, 250);
    setStatus('Recording landscape and portrait...');
    return;
  }

  clearInterval(timerId);
  els.btnRecord.classList.remove('is-recording');
  els.btnRecord.setAttribute('aria-label', 'Record');
  els.btnPhoto.disabled = false;
  setStatus('Saving...');
  const blobs = await recorder.stopRecording();
  els.downloads.hidden = false;
  els.links.replaceChildren();
  for (const [key, blob] of Object.entries(blobs)) {
    els.links.append(download(blob, `recording-${key}-${stamp()}.${extFor(blob)}`));
  }
  setStatus('Saved. Download both files below.');
});

els.btnPhoto.addEventListener('click', async () => {
  try {
    const photos = await recorder.takePhotos();
    els.downloads.hidden = false;
    els.links.replaceChildren();
    for (const [key, blob] of Object.entries(photos)) {
      els.links.append(download(blob, `photo-${key}-${stamp()}.jpg`));
    }
    setStatus('Photos captured in both orientations.');
  } catch (err) {
    setStatus(`Photo error: ${err.message}`);
  }
});

window.addEventListener('pagehide', () => {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  recorder.close();
});
