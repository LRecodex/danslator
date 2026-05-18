import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
  const job = getJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job.progress);
}
