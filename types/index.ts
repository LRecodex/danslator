export type TranslateDirection = 'en-ms' | 'ms-en';
export type TranslationProvider = 'openai' | 'gemini' | 'groq';

export type JobStatus = 'queued' | 'uploading' | 'processing' | 'complete' | 'error';

export interface ProgressState {
  status: JobStatus;
  message: string;
  progress: number;
  error?: string;
  outputFileName?: string;
}

export interface TextBlock {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  source: 'pdf' | 'ocr';
}
