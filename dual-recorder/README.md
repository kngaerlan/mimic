# Dual Recorder (MVP)

Records one camera feed as a landscape (16:9, 1920x1080) and a portrait (9:16, 1080x1920) video at the same time, and takes photos in both orientations.

## Run

    npm run serve        # then open http://localhost:8080

Camera access needs HTTPS or localhost.

## Test

    npm test             # crop-geometry unit tests

The browser flow was also checked headless with Chromium's fake camera: both recordings start and stop together, have the right dimensions, contain Opus audio, and photos save in both orientations.

## Notes and limits

- Portrait is a center crop of the camera frame, so it is narrower than the landscape output.
- Recordings are WebM (VP9/VP8) in Chrome and Firefox. Safari falls back to MP4 if it supports it.
- MediaRecorder WebM files have no duration metadata, so some players show the wrong length. A fix-up step can be added later.
- The recorder uses the rear camera by default (facingMode: environment), which may not exist on a desktop.
