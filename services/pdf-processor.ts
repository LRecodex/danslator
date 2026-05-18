import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { TextBlock, TranslateDirection, TranslationProvider } from '@/types';
import { translateChunks } from './translation';
import { updateJob } from '@/lib/job-store';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { pathToFileURL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBatchThrottleMs(provider: TranslationProvider): number {
  if (provider === 'gemini') return 1200;
  if (provider === 'groq') return 700;
  return 400;
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes(' 429') ||
    message.includes('(429)') ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('too many requests') ||
    message.includes(' 500') ||
    message.includes(' 502') ||
    message.includes(' 503') ||
    message.includes(' 504')
  );
}

function getPdfLoadOptions(pdfBytes: Uint8Array) {
  const fontDir = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts');
  const standardFontDataUrl = pathToFileURL(fontDir + path.sep).toString();
  return {
    data: pdfBytes,
    standardFontDataUrl,
    disableWorker: true,
    useWorkerFetch: false
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

      const [a, , , d, e, f] = item.transform;
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

async function getPdfPageSizesFromBuffer(inputBuffer: Buffer): Promise<Array<{ width: number; height: number }>> {
  const doc = await PDFDocument.load(inputBuffer);
  const sizes: Array<{ width: number; height: number }> = [];
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    sizes.push({ width, height });
  }
  return sizes;
}

async function runCli(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { maxBuffer: 20 * 1024 * 1024 });
    if (stderr && stderr.trim()) {
      console.log(`[Danslator][ocr:${cmd}:stderr]`, stderr.trim().slice(0, 400));
    }
    return stdout;
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    if (err.code === 'ENOENT') {
      throw new Error(`${cmd} is not installed or not in PATH`);
    }
    throw error;
  }
}

function extractPageNum(filePath: string): number {
  const m = path.basename(filePath).match(/-(\d+)\.png$/i);
  return m ? Number(m[1]) : -1;
}

function readPngDimensions(filePath: string): { width: number; height: number } {
  const data = fs.readFileSync(filePath);
  if (data.length < 24 || data.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Invalid PNG file generated for OCR: ${filePath}`);
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  return { width, height };
}

function parseTesseractTsvToBlocks(
  tsv: string,
  pageIndex: number,
  pageSize: { width: number; height: number },
  imageSize: { width: number; height: number }
): TextBlock[] {
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  type LineAgg = {
    left: number;
    top: number;
    right: number;
    bottom: number;
    words: string[];
  };
  const lineMap = new Map<string, LineAgg>();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 12) continue;

    const level = Number(cols[0]);
    const blockNum = cols[2];
    const parNum = cols[3];
    const lineNum = cols[4];
    const left = Number(cols[6]);
    const top = Number(cols[7]);
    const width = Number(cols[8]);
    const height = Number(cols[9]);
    const text = (cols[11] ?? '').trim();

    if (level !== 5 || !text || width <= 0 || height <= 0) continue;

    const key = `${blockNum}-${parNum}-${lineNum}`;
    const right = left + width;
    const bottom = top + height;
    const existing = lineMap.get(key);

    if (!existing) {
      lineMap.set(key, { left, top, right, bottom, words: [text] });
      continue;
    }

    existing.left = Math.min(existing.left, left);
    existing.top = Math.min(existing.top, top);
    existing.right = Math.max(existing.right, right);
    existing.bottom = Math.max(existing.bottom, bottom);
    existing.words.push(text);
  }

  const scaleX = pageSize.width / imageSize.width;
  const scaleY = pageSize.height / imageSize.height;
  const blocks: TextBlock[] = [];

  for (const agg of lineMap.values()) {
    const text = agg.words.join(' ').trim();
    if (!text) continue;

    const x = agg.left * scaleX;
    const topY = agg.top * scaleY;
    const height = Math.max(1, (agg.bottom - agg.top) * scaleY);
    const y = pageSize.height - topY - height;
    const width = Math.max(1, (agg.right - agg.left) * scaleX);

    blocks.push({
      pageIndex,
      x,
      y,
      width,
      height,
      text,
      source: 'ocr'
    });
  }

  return blocks;
}

async function extractOcrBlocks(
  inputBuffer: Buffer,
  pdfBytes: Uint8Array,
  progress: ProgressCb
): Promise<TextBlock[]> {
  const blocks: TextBlock[] = [];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'danslator-ocr-'));
  const inputPdfPath = path.join(tempDir, 'input.pdf');
  const imagePrefix = path.join(tempDir, 'page');

  fs.writeFileSync(inputPdfPath, Buffer.from(pdfBytes));
  const pageSizes = await getPdfPageSizesFromBuffer(inputBuffer);

  try {
    await runCli('pdftoppm', ['-png', '-r', '200', inputPdfPath, imagePrefix]);

    const pngFiles = fs
      .readdirSync(tempDir)
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .map((name) => path.join(tempDir, name))
      .sort((a, b) => extractPageNum(a) - extractPageNum(b));

    for (let i = 0; i < pngFiles.length; i++) {
      const imagePath = pngFiles[i];
      const pageNumber = extractPageNum(imagePath);
      if (pageNumber < 1 || pageNumber > pageSizes.length) continue;

      const pageSize = pageSizes[pageNumber - 1];
      const imageSize = readPngDimensions(imagePath);
      const tsv = await runCli('tesseract', [imagePath, 'stdout', '-l', 'eng+msa', 'tsv']);
      const pageBlocks = parseTesseractTsvToBlocks(tsv, pageNumber - 1, pageSize, imageSize);
      blocks.push(...pageBlocks);

      const pageProgress = 30 + Math.round(((i + 1) / Math.max(1, pngFiles.length)) * 20);
      progress(`Reading text inside images (page ${i + 1}/${pngFiles.length})`, pageProgress);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return blocks;
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
  const log = (stage: string, meta?: Record<string, unknown>) => {
    console.log(`[Danslator][processPdf:${stage}]`, { jobId: options.jobId, ...meta });
  };
  const logError = (stage: string, error: unknown, meta?: Record<string, unknown>) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[Danslator][processPdf:${stage}]`, {
      jobId: options.jobId,
      message: err.message,
      stack: err.stack,
      ...meta
    });
  };

  const report = (message: string, progress: number) => {
    updateJob(options.jobId, { status: 'processing', message, progress });
  };

  try {
    report('Extracting PDF text', 10);
    log('extract:start');
    const pdfBytes = new Uint8Array(inputBuffer);
    const pdfBlocks = await extractPdfTextBlocks(pdfBytes);
    log('extract:done', { pdfTextBlocks: pdfBlocks.length });

    let ocrBlocks: TextBlock[] = [];
    if (options.includeImageText) {
      report('Preparing OCR for images', 25);
      log('ocr:start');
      try {
        ocrBlocks = await extractOcrBlocks(inputBuffer, pdfBytes, report);
        log('ocr:done', { ocrBlocks: ocrBlocks.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const canFallback =
          message.includes('Document stream is empty') ||
          message.toLowerCase().includes('no pdf stream') ||
          message.includes('Cannot transfer object of unsupported type') ||
          message.includes('is not installed or not in PATH');

        if (!canFallback) throw error;
        logError('ocr:fallback_to_text_only', error, { reason: 'ocr_backend_error' });
        report('OCR unavailable for this file/environment, continuing with PDF text only', 45);
        ocrBlocks = [];
      }
    }

    const allBlocks = [...pdfBlocks, ...ocrBlocks];
    report('Translating extracted text', 55);
    log('translate:start', {
      provider: options.provider,
      totalBlocks: allBlocks.length
    });

    const textList = allBlocks.map((b) => b.text);
    const translated: string[] = [];

    const batches = chunkStrings(textList, 20);
    const throttleMs = getBatchThrottleMs(options.provider);
    for (let i = 0; i < batches.length; i++) {
      let success = false;
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const batchResult = await translateChunks(batches[i], {
            direction: options.direction,
            provider: options.provider,
            openAiApiKey: options.openAiApiKey,
            geminiApiKey: options.geminiApiKey,
            groqApiKey: options.groqApiKey
          });
          translated.push(...batchResult);
          success = true;
          break;
        } catch (error) {
          lastError = error;
          const retryable = isRetryableError(error);
          logError('translate:batch_attempt_failed', error, {
            batchIndex: i + 1,
            totalBatches: batches.length,
            provider: options.provider,
            attempt,
            retryable
          });
          if (!retryable || attempt === 4) break;
          const backoff = Math.min(8000, throttleMs * Math.pow(2, attempt));
          report(
            `Rate limited by ${options.provider}. Retrying batch ${i + 1}/${batches.length}...`,
            55 + Math.round(((i + 1) / batches.length) * 25)
          );
          await sleep(backoff);
        }
      }

      if (!success) {
        logError('translate:batch_failed', lastError, {
          batchIndex: i + 1,
          totalBatches: batches.length,
          provider: options.provider
        });
        throw lastError instanceof Error ? lastError : new Error('Batch translation failed');
      }

      const pct = 55 + Math.round(((i + 1) / batches.length) * 25);
      report(`Translating content (${i + 1}/${batches.length})`, pct);
      if (i < batches.length - 1) await sleep(throttleMs);
    }
    log('translate:done', { translatedCount: translated.length });

    report('Generating translated PDF', 85);
    log('pdf_build:start');

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
    const outputFileName = options.fileName.replace(/(\.translated)*\.pdf$/i, '') + '.translated.pdf';
    log('pdf_build:done', { outputFileName });
    return { output, outputFileName };
  } catch (error) {
    logError('failed', error, {
      provider: options.provider,
      includeImageText: options.includeImageText,
      fileName: options.fileName
    });
    throw error;
  }
}
