import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function GET(_: NextRequest, { params }: { params: { jobId: string } }) {
  const job = getJob(params.jobId);
  if (!job || !job.outputBuffer) {
    return NextResponse.json({ error: 'Translated PDF is not available yet' }, { status: 404 });
  }

  return new NextResponse(job.outputBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${job.progress.outputFileName ?? 'translated.pdf'}"`
    }
  });
}
