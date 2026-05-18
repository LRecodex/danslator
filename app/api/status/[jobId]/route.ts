import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/job-store';

export const runtime = 'nodejs';

export async function GET(_: NextRequest, { params }: { params: { jobId: string } }) {
  const job = getJob(params.jobId);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job.progress);
}
