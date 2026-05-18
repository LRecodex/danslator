# Danslator

Danslator is a web app to translate PDF documents between English and Malay, with optional OCR for text inside images.

## Features

- Drag-and-drop PDF upload
- Translation direction:
  - English -> Malay
  - Malay -> English
- Post-upload mode choice:
  - Translate PDF text only
  - Translate PDF text + text inside images
- OCR support for image text (`tesseract.js`)
- Progress tracking (upload, processing, completion)
- Download translated PDF output

## Tech Stack

- Frontend: Next.js + React
- Backend: Next.js API routes (Node.js runtime)
- PDF extraction: `pdfjs-dist`
- OCR: `tesseract.js` + `canvas`
- Translation: OpenAI API (user provides key in UI)
- PDF output generation: `pdf-lib`

## Requirements

- Node.js 18+ (recommended Node.js 20)
- npm 9+

## 1. Clone to local

```bash
git clone <your-repo-url> danslator
cd danslator
```

If you already have the project folder, just open it and run commands from the root.

## 2. Install dependencies

```bash
npm install
```

## 3. Configure environment

No OpenAI server key is required by default.

You can copy the template file:

```bash
cp .env.example .env.local
```

Current app behavior: users enter their own OpenAI API key in the UI at translation time.

## 4. Run in development

```bash
npm run dev
```

Open:

- `http://localhost:3000`

## 5. How to use the app

1. Open the home page.
2. Drag and drop a PDF (or click upload area to choose file).
3. Choose language direction:
   - English -> Malay
   - Malay -> English
4. Paste OpenAI API key in the `OpenAI API Key` field.
5. Choose translation mode:
   - `Translate PDF text only`
   - `Translate PDF text + text inside images`
6. Click `Translate PDF`.
7. Wait while progress updates.
8. Click `Download Translated PDF` when complete.

## Build and production run

Build:

```bash
npm run build
```

Start:

```bash
npm run start
```

## API endpoints

- `POST /api/translate`
  - `multipart/form-data` fields:
    - `file` (PDF)
    - `direction` (`en-ms` or `ms-en`)
    - `includeImageText` (`true` or `false`)
    - `openAiApiKey` (string)
- `GET /api/status/:jobId`
- `GET /api/download/:jobId`

## Notes and limitations

- Layout preservation is best effort (overlay strategy on copied pages).
- OCR mode is slower on large PDFs.
- Very complex layouts may not perfectly match original text flow.
- Jobs are stored in-memory and expire automatically; for production, use persistent job storage.
# danslator
