import { coverCrop, ORIENTATIONS } from './cropMath.js';

/**
 * Records one camera feed into two files at once: a landscape (16:9) clip and
 * a portrait (9:16) clip. Each output is drawn from the same camera frames onto
 * its own canvas, so both recordings share a start time and stop together.
 */
export class DualRecorder {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.sourceVideo  element that plays the camera stream (muted)
   * @param {Record<string, HTMLCanvasElement>} opts.canvases  { landscape, portrait } canvases
   */
  constructor({ sourceVideo, canvases }) {
    this.sourceVideo = sourceVideo;
    this.canvases = canvases;
    this.stream = null;
    this.recorders = {};
    this.chunks = { landscape: [], portrait: [] };
    this.running = false;
    this.recording = false;
    this.frameHandle = null;
    this.mimeType = pickMimeType();
  }

  /** Requests camera and microphone and starts drawing preview frames. */
  async open() {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: true,
    });
    this.sourceVideo.srcObject = this.stream;
    this.sourceVideo.muted = true;
    await this.sourceVideo.play();
    this.running = true;
    this.drawLoop();
  }

  /** Stops the camera and any active recording. */
  close() {
    if (this.recording) this.stopRecording();
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.sourceVideo.srcObject = null;
  }

  /** Draws the camera frame onto both canvases, cover-cropped to each shape. */
  drawLoop = () => {
    if (!this.running) return;
    const v = this.sourceVideo;
    if (v.readyState >= 2 && v.videoWidth > 0) {
      for (const key of Object.keys(ORIENTATIONS)) {
        const canvas = this.canvases[key];
        const { width, height } = ORIENTATIONS[key];
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        const ctx = canvas.getContext('2d');
        const c = coverCrop(v.videoWidth, v.videoHeight, width, height);
        ctx.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, width, height);
      }
    }
    this.frameHandle = requestAnimationFrame(this.drawLoop);
  };

  /** Starts both recordings in the same tick. */
  startRecording() {
    if (this.recording) return;
    if (!this.stream) throw new Error('camera is not open');
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder is not supported here');

    const audioTracks = this.stream.getAudioTracks();
    this.chunks = { landscape: [], portrait: [] };
    this.recorders = {};

    for (const key of Object.keys(ORIENTATIONS)) {
      const canvasStream = this.canvases[key].captureStream(30);
      audioTracks.forEach((t) => canvasStream.addTrack(t));
      const rec = new MediaRecorder(canvasStream, this.mimeType ? { mimeType: this.mimeType } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks[key].push(e.data);
      };
      this.recorders[key] = rec;
    }

    this.startedAt = performance.now();
    Object.values(this.recorders).forEach((r) => r.start(1000));
    this.recording = true;
  }

  /**
   * Stops both recordings and resolves with { landscape, portrait } Blobs.
   * @returns {Promise<Record<string, Blob>>}
   */
  stopRecording() {
    if (!this.recording) return Promise.resolve({});
    this.recording = false;
    const stops = Object.entries(this.recorders).map(
      ([key, rec]) =>
        new Promise((resolve) => {
          rec.onstop = () => {
            const type = rec.mimeType || this.mimeType || 'video/webm';
            resolve([key, new Blob(this.chunks[key], { type })]);
          };
          rec.stop();
        }),
    );
    return Promise.all(stops).then((entries) => Object.fromEntries(entries));
  }

  /** Seconds elapsed since startRecording(), or 0 when idle. */
  elapsedSeconds() {
    return this.recording ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  /**
   * Captures a still photo in both orientations from the current preview frame.
   * @returns {Promise<Record<string, Blob>>}
   */
  takePhotos() {
    const shots = Object.entries(this.canvases).map(
      ([key, canvas]) =>
        new Promise((resolve, reject) =>
          canvas.toBlob(
            (blob) => (blob ? resolve([key, blob]) : reject(new Error('photo capture failed'))),
            'image/jpeg',
            0.92,
          ),
        ),
    );
    return Promise.all(shots).then((entries) => Object.fromEntries(entries));
  }
}

/** Picks the first container/codec the browser can record, or null for its default. */
export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? null;
}
