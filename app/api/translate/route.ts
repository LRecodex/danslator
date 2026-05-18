import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob, failJob, setJobOutput, updateJob } from '@/lib/job-store';
import { processPdf } from '@/services/pdf-processor';
import { TranslateDirection, TranslationProvider } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

function logError(scope: string, error: unknown, meta?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[Danslator][${scope}]`, {
    message: err.message,
    stack: err.stack,
    ...meta
  });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const direction = (formData.get('direction') as TranslateDirection | null) ?? 'en-ms';
    const provider = (formData.get('provider') as TranslationProvider | null) ?? 'openai';
    const outputStyle = 'overlay';
    const includeImageText = false;
    const openAiApiKey = (formData.get('openAiApiKey') as string | null)?.trim() ?? '';
    const geminiApiKey = (formData.get('geminiApiKey') as string | null)?.trim() ?? '';
    const groqApiKey = (formData.get('groqApiKey') as string | null)?.trim() ?? '';
    const groqModel = (formData.get('groqModel') as string | null)?.trim() || 'llama-3.1-8b-instant';

    if (!file) {
      return NextResponse.json({ error: 'No PDF file uploaded' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }
    if (provider !== 'openai' && provider !== 'gemini' && provider !== 'groq') {
      return NextResponse.json({ error: 'Invalid provider. Use openai, gemini, or groq.' }, { status: 400 });
    }
    if (provider === 'openai' && !openAiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key is required for OpenAI provider.' }, { status: 400 });
    }
    if (provider === 'gemini' && !geminiApiKey) {
      return NextResponse.json({ error: 'Gemini API key is required for Gemini provider.' }, { status: 400 });
    }
    if (provider === 'groq' && !groqApiKey) {
      return NextResponse.json({ error: 'Groq API key is required for Groq provider.' }, { status: 400 });
    }
    const jobId = uuidv4();
    console.log('[Danslator][translate:start]', {
      jobId,
      fileName: file.name,
      direction,
      provider,
      outputStyle,
      includeImageText
    });
    createJob(jobId);
    updateJob(jobId, { status: 'uploading', message: 'Receiving uploaded file', progress: 5 });

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    void (async () => {
      try {
        const result = await processPdf(inputBuffer, {
          jobId,
          direction,
          provider,
          outputStyle,
          includeImageText,
          fileName: file.name,
          openAiApiKey,
          geminiApiKey,
          groqApiKey,
          groqModel
        });
        setJobOutput(jobId, result.output, result.outputFileName);
        console.log('[Danslator][translate:done]', {
          jobId,
          outputFileName: result.outputFileName
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown processing error';
        logError('translate:background', err, { jobId, provider, fileName: file.name });
        failJob(jobId, message);
      }
    })();

    return NextResponse.json({ jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    logError('translate:route', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
