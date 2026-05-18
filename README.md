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
- Translation: OpenAI, Gemini, or Groq
- PDF output generation: `pdf-lib`

## Requirements

- Node.js 18+ (Node.js 24 is supported, but OCR may require native build dependencies)
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

After dependency updates, if you want a clean reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

If you want OCR mode (`Translate PDF text + text inside images`) on Linux/WSL, install native build tools first:

```bash
sudo apt-get update
sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev pkg-config
```

## 3. Configure environment

No server-side provider key is used.

You can copy the template file:

```bash
cp .env.example .env.local
```

Current app behavior:

- User chooses provider: OpenAI, Gemini, or Groq.
- Provider key is always read from user input in the form per request.
- No provider key is loaded from `.env`.

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
4. Choose provider (`OpenAI`, `Gemini`, or `Groq`).
5. Paste the matching API key.
6. Choose translation mode:
   - `Translate PDF text only`
   - `Translate PDF text + text inside images`
7. Click `Translate PDF`.
8. Wait while progress updates.
9. Click `Download Translated PDF` when complete.

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
    - `provider` (`openai`, `gemini`, or `groq`)
    - `includeImageText` (`true` or `false`)
    - `openAiApiKey` (string, optional)
    - `geminiApiKey` (string, optional)
    - `groqApiKey` (string, optional)
- `GET /api/status/:jobId`
- `GET /api/download/:jobId`

## Notes and limitations

- Layout preservation is best effort (overlay strategy on copied pages).
- OCR mode is slower on large PDFs and requires optional native dependency support for `canvas`.
- Very complex layouts may not perfectly match original text flow.
- Jobs are stored on local disk under `/tmp/danslator-jobs` and expire automatically; for production, use persistent shared storage.
