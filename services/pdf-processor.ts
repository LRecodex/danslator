import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TextBlock, TranslateDirection, TranslationProvider } from '@/types';
import { translateChunks } from './translation';
import { updateJob } from '@/lib/job-store';
import { createWorker } from 'tesseract.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as path from 'path';
import { pathToFileURL } from 'url';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url
).toString();

type ProgressCb = (message: string, progress: number) => void;

interface ProcessOptions {
  jobId: string;
  direction: TranslateDirection;
  provider: TranslationProvider;
  includeImageText: boolean;
  fileName: string;
  openAiApiKey: string;
  geminiApiKey: string;
  groqApiKey: string;
}

function getPdfLoadOptions(pdfBytes: Uint8Array) {
  const fontDir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  const standardFontDataUrl = pathToFileURL(fontDir + path.sep).toString();
  return {
    data: pdfBytes,
    standardFontDataUrl
  };
}

async function extractPdfTextBlocks(pdfBytes: Uint8Array): Promise<TextBlock[]> {
  const blocks: TextBlock[] = [];
  const loadingTask = pdfjs.getDocument(getPdfLoadOptions(pdfBytes));
  const doc = await loadingTask.promise;

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    for (const item of content.items as any[]) {
      const text = (item.str ?? '').trim();
      if (!text) continue;

      const [a, b, c, d, e, f] = item.transform;
      const width = item.width || Math.abs(a) || 100;
      const height = item.height || Math.abs(d) || 12;

      blocks.push({
        pageIndex: pageNumber - 1,
        x: e,
        y: f,
        width,
        height,
        text,
        source: 'pdf'
      });
    }
  }

  return blocks;
}

async function extractOcrBlocks(pdfBytes: Uint8Array, progress: ProgressCb): Promise<TextBlock[]> {
  const blocks: TextBlock[] = [];
  const loadingTask = pdfjs.getDocument(getPdfLoadOptions(pdfBytes));
  const doc = await loadingTask.promise;
  const createCanvas = await loadCanvasFactory();

  const worker = await createWorker('eng+msa');

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx as any, viewport }).promise;

      const result = await worker.recognize(canvas.toBuffer('image/png'));
      const pageProgress = 30 + Math.round((pageNumber / doc.numPages) * 20);
      progress(`Reading text inside images (page ${pageNumber}/${doc.numPages})`, pageProgress);

      for (const line of result.data.lines) {
        const text = line.text.trim();
        if (!text) continue;

        blocks.push({
          pageIndex: pageNumber - 1,
          x: line.bbox.x0 / 2,
          y: viewport.height / 2 - line.bbox.y1 / 2,
          width: (line.bbox.x1 - line.bbox.x0) / 2,
          height: (line.bbox.y1 - line.bbox.y0) / 2,
          text,
          source: 'ocr'
        });
      }
    }
  } finally {
    await worker.terminate();
  }

  return blocks;
}

async function loadCanvasFactory(): Promise<(width: number, height: number) => any> {
  try {
    const mod = await import('canvas');
    return mod.createCanvas;
  } catch {
    throw new Error(
      'OCR mode requires the optional "canvas" package. Install system deps and run: npm install canvas'
    );
  }
}

function chunkStrings(items: string[], size = 30): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function processPdf(
  inputBuffer: Buffer,
  options: ProcessOptions
): Promise<{ output: Buffer; outputFileName: string }> {
  const report = (message: string, progress: number) => {
    updateJob(options.jobId, { status: 'processing', message, progress });
  };

  report('Extracting PDF text', 10);
  const pdfBytes = new Uint8Array(inputBuffer);
  const pdfBlocks = await extractPdfTextBlocks(pdfBytes);

  let ocrBlocks: TextBlock[] = [];
  if (options.includeImageText) {
    report('Preparing OCR for images', 25);
    ocrBlocks = await extractOcrBlocks(pdfBytes, report);
  }

  const allBlocks = [...pdfBlocks, ...ocrBlocks];
  report('Translating extracted text', 55);

  const textList = allBlocks.map((b) => b.text);
  const translated: string[] = [];

  const batches = chunkStrings(textList, 30);
  for (let i = 0; i < batches.length; i++) {
    const batchResult = await translateChunks(batches[i], {
      direction: options.direction,
      provider: options.provider,
      openAiApiKey: options.openAiApiKey,
      geminiApiKey: options.geminiApiKey,
      groqApiKey: options.groqApiKey
    });
    translated.push(...batchResult);
    const pct = 55 + Math.round(((i + 1) / batches.length) * 25);
    report(`Translating content (${i + 1}/${batches.length})`, pct);
  }

  report('Generating translated PDF', 85);

  const sourcePdf = await PDFDocument.load(inputBuffer);
  const outPdf = await PDFDocument.create();
  const font = await outPdf.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < sourcePdf.getPageCount(); i++) {
    const [copied] = await outPdf.copyPages(sourcePdf, [i]);
    outPdf.addPage(copied);
  }

  for (let i = 0; i < allBlocks.length; i++) {
    const block = allBlocks[i];
    const page = outPdf.getPage(block.pageIndex);
    const translatedText = translated[i] ?? block.text;
    const fontSize = Math.max(8, Math.min(14, block.height));

    // Paint a solid white mask slightly larger than the detected text box
    // so source glyph edges do not bleed through.
    const padX = 2;
    const padY = 2;
    page.drawRectangle({
      x: Math.max(0, block.x - padX),
      y: Math.max(0, block.y - padY),
      width: Math.max(14, block.width + padX * 2),
      height: Math.max(12, block.height + padY * 2 + 2),
      color: rgb(1, 1, 1),
      opacity: 1
    });

    page.drawText(translatedText, {
      x: Math.max(0, block.x),
      y: Math.max(0, block.y),
      maxWidth: Math.max(20, block.width),
      size: fontSize,
      font,
      color: rgb(0, 0, 0)
    });
  }

  const output = Buffer.from(await outPdf.save());
  const outputFileName = options.fileName.replace(/\.pdf$/i, '') + '.translated.pdf';
  return { output, outputFileName };
}
