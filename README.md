# Mimic

Mimic is a browser-first photo editing MVP that learns a visual look from reference photos and adaptively applies that look to new images.

## What it does

- Extracts a lightweight style fingerprint from reference images using canvas pixel statistics.
- Applies tone, color, contrast, shadow, highlight, grain, and vignette adjustments without changing the scene or subject.
- Supports multiple references and batch target photos.
- Keeps image processing on-device; no generative image service is used.
- Exports edited JPEGs directly from the browser.

## Run locally

```bash
npm install
npm run dev
```

Build for Cloudflare Pages with:

```bash
npm run build
```

The static output is written to `dist/`.
