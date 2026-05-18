import { ProgressState } from '@/types';

interface JobRecord {
  progress: ProgressState;
  outputBuffer?: Buffer;
  createdAt: number;
}

const jobs = new Map<string, JobRecord>();

export function createJob(jobId: string) {
  jobs.set(jobId, {
    createdAt: Date.now(),
    progress: {
      status: 'queued',
      message: 'Job queued',
      progress: 0
    }
  });
}

export function updateJob(jobId: string, partial: Partial<ProgressState>) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.progress = { ...job.progress, ...partial };
}

export function setJobOutput(jobId: string, outputBuffer: Buffer, outputFileName: string) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.outputBuffer = outputBuffer;
  job.progress = {
    ...job.progress,
    status: 'complete',
    message: 'Translation completed',
    progress: 100,
    outputFileName
  };
}

export function failJob(jobId: string, error: string) {
  const job = jobs.get(jobId);
  if (!job) return;
  job.progress = {
    ...job.progress,
    status: 'error',
    message: 'Translation failed',
    error,
    progress: 100
  };
}

export function getJob(jobId: string) {
  return jobs.get(jobId);
}

setInterval(() => {
  const ttlMs = 1000 * 60 * 30;
  const now = Date.now();
  for (const [jobId, record] of jobs.entries()) {
    if (now - record.createdAt > ttlMs) jobs.delete(jobId);
  }
}, 1000 * 60 * 10);
