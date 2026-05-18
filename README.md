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
- OCR support for image text (`pdftoppm` + `tesseract` CLI)
- Progress tracking (upload, processing, completion)
- Download translated PDF output

## Tech Stack

- Frontend: Next.js + React
- Backend: Next.js API routes (Node.js runtime)
- PDF extraction: `pdfjs-dist`
- OCR: `pdftoppm` (Poppler) + `tesseract` CLI
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

Install OCR CLI dependencies required by Danslator:

- `pdftoppm` (Poppler)
- `tesseract` OCR with language packs (`eng`, `msa`)

Linux/WSL example:

```bash
sudo apt-get install -y poppler-utils tesseract-ocr tesseract-ocr-eng tesseract-ocr-msa
```

Windows:
- Install Poppler for Windows and add its `bin` folder to `PATH` (for `pdftoppm`).
- Install Tesseract for Windows and add install folder to `PATH`.

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
- If provider is Groq, user can choose the Groq model from a dropdown in the UI.

## 3.1 Get API keys (OpenAI / Gemini / Groq)

Danslator requires you to paste a provider API key in the UI before translating.

OpenAI key:
- Site: `https://platform.openai.com/`
- API keys page: `https://platform.openai.com/api-keys`
- Create a key, then copy and paste it into Danslator when provider is `OpenAI`.

Gemini key:
- Site: `https://aistudio.google.com/`
- API key page: `https://aistudio.google.com/apikey`
- Create a key, then copy and paste it into Danslator when provider is `Gemini`.
- If you see quota errors (`429`), check usage/billing in AI Studio.

Groq key:
- Site: `https://console.groq.com/`
- API keys page: `https://console.groq.com/keys`
- Create a key, then copy and paste it into Danslator when provider is `Groq`.

Security tips:
- Never commit keys to git.
- Rotate/revoke keys immediately if exposed.

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
7. Choose output style:
   - `Clean Regenerated PDF (recommended)`
   - `Overlay on Original PDF`
8. Click `Translate PDF`.
9. Wait while progress updates.
10. Click `Download Translated PDF` when complete.

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
    - `outputStyle` (`clean` or `overlay`)
    - `openAiApiKey` (string, optional)
    - `geminiApiKey` (string, optional)
    - `groqApiKey` (string, optional)
    - `groqModel` (string, optional; used when provider is `groq`)
- `GET /api/status/:jobId`
- `GET /api/download/:jobId`

## Notes and limitations

- Layout preservation is best effort (overlay strategy on copied pages).
- OCR mode is slower on large PDFs and requires `pdftoppm` + `tesseract` installed and available in `PATH`.
- Very complex layouts may not perfectly match original text flow.
- Jobs are stored on local disk under `/tmp/danslator-jobs` and expire automatically; for production, use persistent shared storage.
