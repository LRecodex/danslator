import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob, failJob, setJobOutput, updateJob } from '@/lib/job-store';
import { processPdf } from '@/services/pdf-processor';
import { TranslateDirection } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const direction = (formData.get('direction') as TranslateDirection | null) ?? 'en-ms';
    const includeImageText = formData.get('includeImageText') === 'true';
    const openAiApiKey = (formData.get('openAiApiKey') as string | null)?.trim() ?? '';

    if (!file) {
      return NextResponse.json({ error: 'No PDF file uploaded' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }
    if (!openAiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key is required' }, { status: 400 });
    }

    const jobId = uuidv4();
    createJob(jobId);
    updateJob(jobId, { status: 'uploading', message: 'Receiving uploaded file', progress: 5 });

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    void (async () => {
      try {
        const result = await processPdf(inputBuffer, {
          jobId,
          direction,
          includeImageText,
          fileName: file.name,
          openAiApiKey
        });
        setJobOutput(jobId, result.output, result.outputFileName);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown processing error';
        failJob(jobId, message);
      }
    })();

    return NextResponse.json({ jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
