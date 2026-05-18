import { ProgressState } from '@/types';
import * as fs from 'fs';
import * as path from 'path';

interface JobRecord {
  progress: ProgressState;
  outputBuffer?: Buffer;
  createdAt: number;
}

const jobs = new Map<string, JobRecord>();
const JOBS_DIR = path.join('/tmp', 'danslator-jobs');

function ensureJobsDir() {
  if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR, { recursive: true });
}

function jobPaths(jobId: string) {
  return {
    dir: path.join(JOBS_DIR, jobId),
    meta: path.join(JOBS_DIR, jobId, 'job.json'),
    output: path.join(JOBS_DIR, jobId, 'output.pdf')
  };
}

function persistJob(jobId: string, record: JobRecord) {
  ensureJobsDir();
  const paths = jobPaths(jobId);
  if (!fs.existsSync(paths.dir)) fs.mkdirSync(paths.dir, { recursive: true });
  fs.writeFileSync(
    paths.meta,
    JSON.stringify(
      {
        createdAt: record.createdAt,
        progress: record.progress
      },
      null,
      2
    ),
    'utf-8'
  );
  if (record.outputBuffer) {
    fs.writeFileSync(paths.output, record.outputBuffer);
  }
}

function hydrateJob(jobId: string): JobRecord | undefined {
  const paths = jobPaths(jobId);
  if (!fs.existsSync(paths.meta)) return undefined;
  const raw = fs.readFileSync(paths.meta, 'utf-8');
  const parsed = JSON.parse(raw) as { createdAt: number; progress: ProgressState };
  const record: JobRecord = {
    createdAt: parsed.createdAt,
    progress: parsed.progress
  };
  if (fs.existsSync(paths.output)) {
    record.outputBuffer = fs.readFileSync(paths.output);
  }
  jobs.set(jobId, record);
  return record;
}

export function createJob(jobId: string) {
  const record: JobRecord = {
    createdAt: Date.now(),
    progress: {
      status: 'queued',
      message: 'Job queued',
      progress: 0
    }
  };
  jobs.set(jobId, record);
  persistJob(jobId, record);
}

export function updateJob(jobId: string, partial: Partial<ProgressState>) {
  const job = jobs.get(jobId) ?? hydrateJob(jobId);
  if (!job) return;
  job.progress = { ...job.progress, ...partial };
  persistJob(jobId, job);
}

export function setJobOutput(jobId: string, outputBuffer: Buffer, outputFileName: string) {
  const job = jobs.get(jobId) ?? hydrateJob(jobId);
  if (!job) return;
  job.outputBuffer = outputBuffer;
  job.progress = {
    ...job.progress,
    status: 'complete',
    message: 'Translation completed',
    progress: 100,
    outputFileName
  };
  persistJob(jobId, job);
}

export function failJob(jobId: string, error: string) {
  const job = jobs.get(jobId) ?? hydrateJob(jobId);
  if (!job) return;
  job.progress = {
    ...job.progress,
    status: 'error',
    message: 'Translation failed',
    error,
    progress: 100
  };
  persistJob(jobId, job);
}

export function getJob(jobId: string) {
  return jobs.get(jobId) ?? hydrateJob(jobId);
}

setInterval(() => {
  const ttlMs = 1000 * 60 * 30;
  const now = Date.now();

  for (const [jobId, record] of jobs.entries()) {
    if (now - record.createdAt > ttlMs) {
      jobs.delete(jobId);
      const paths = jobPaths(jobId);
      fs.rmSync(paths.dir, { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(JOBS_DIR)) return;
  for (const jobId of fs.readdirSync(JOBS_DIR)) {
    const paths = jobPaths(jobId);
    if (!fs.existsSync(paths.meta)) continue;
    try {
      const raw = fs.readFileSync(paths.meta, 'utf-8');
      const parsed = JSON.parse(raw) as { createdAt: number };
      if (now - parsed.createdAt > ttlMs) {
        fs.rmSync(paths.dir, { recursive: true, force: true });
      }
    } catch {
      fs.rmSync(paths.dir, { recursive: true, force: true });
    }
  }
}, 1000 * 60 * 10);
