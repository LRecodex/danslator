'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { OutputStyle, ProgressState, TranslateDirection, TranslationProvider } from '@/types';

const initialProgress: ProgressState = {
  status: 'queued',
  message: 'Waiting for upload',
  progress: 0
};

export function DanslatorForm() {
  const [file, setFile] = useState<File | null>(null);
  const [direction, setDirection] = useState<TranslateDirection>('en-ms');
  const [provider, setProvider] = useState<TranslationProvider>('openai');
  const [mode, setMode] = useState<'text-only' | 'text-images'>('text-only');
  const [outputStyle, setOutputStyle] = useState<OutputStyle>('clean');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [groqModel, setGroqModel] = useState('llama-3.1-8b-instant');
  const [isDragging, setIsDragging] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(initialProgress);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canTranslate = useMemo(() => {
    return !!file && !['uploading', 'processing'].includes(progress.status);
  }, [file, progress.status]);

  useEffect(() => {
    if (!jobId) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to read job status');
          clearInterval(timer);
          return;
        }

        setProgress(data);
        if (data.status === 'complete' || data.status === 'error') clearInterval(timer);
      } catch {
        setError('Network error while checking translation progress');
        clearInterval(timer);
      }
    }, 1200);

    return () => clearInterval(timer);
  }, [jobId]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      setFile(dropped);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setError(null);
    setProgress({ status: 'uploading', message: 'Uploading PDF', progress: 2 });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('direction', direction);
    formData.append('provider', provider);
    formData.append('includeImageText', String(mode === 'text-images'));
    formData.append('outputStyle', outputStyle);
    formData.append('openAiApiKey', openAiApiKey.trim());
    formData.append('geminiApiKey', geminiApiKey.trim());
    formData.append('groqApiKey', groqApiKey.trim());
    formData.append('groqModel', groqModel);

    try {
      const res = await fetch('/api/translate', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to start translation');
        setProgress(initialProgress);
        return;
      }

      setJobId(data.jobId);
      setProgress({ status: 'processing', message: 'Translation started', progress: 8 });
    } catch {
      setError('Upload failed. Please try again.');
      setProgress(initialProgress);
    }
  };

  return (
    <div className="card">
      <div
        className={`dropzone ${isDragging ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <p><strong>Drop your PDF here</strong> or click to browse</p>
        <p className="muted">Supports large PDFs. Keep this tab open while translation is running.</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="section">
        <div className="section-title">Translation Settings</div>
      <div className="row">
        <div className="field">
          <label htmlFor="direction">Language Direction</label>
          <select
            id="direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as TranslateDirection)}
          >
            <option value="en-ms">English → Malay</option>
            <option value="ms-en">Malay → English</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="provider">Translation Provider</label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as TranslationProvider)}
            style={{ marginBottom: 8 }}
          >
            <option value="openai">Use OpenAI</option>
            <option value="gemini">Use Gemini</option>
            <option value="groq">Use Groq</option>
          </select>
          <label htmlFor="provider-key">
            {provider === 'openai'
              ? 'OpenAI API Key'
              : provider === 'gemini'
                ? 'Gemini API Key'
                : 'Groq API Key'}
          </label>
          <input
            id="provider-key"
            type="password"
            placeholder={provider === 'openai' ? 'sk-...' : provider === 'gemini' ? 'AIza...' : 'gsk_...'}
            value={
              provider === 'openai' ? openAiApiKey : provider === 'gemini' ? geminiApiKey : groqApiKey
            }
            onChange={(e) => {
              if (provider === 'openai') setOpenAiApiKey(e.target.value);
              else if (provider === 'gemini') setGeminiApiKey(e.target.value);
              else setGroqApiKey(e.target.value);
            }}
          />
          {provider === 'groq' ? (
            <>
              <label htmlFor="groq-model" style={{ marginTop: 8 }}>Groq Model</label>
              <select id="groq-model" value={groqModel} onChange={(e) => setGroqModel(e.target.value)}>
                <option value="llama-3.1-8b-instant">llama-3.1-8b-instant</option>
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                <option value="meta-llama/llama-4-scout-17b-16e-instruct">llama-4-scout-17b-16e-instruct</option>
              </select>
            </>
          ) : null}
          <p className="muted" style={{ marginTop: 8 }}>
            Provide the API key for the selected provider. Keys are sent per request only.
          </p>
        </div>
      </div>
      </div>

      {file ? (
        <div className="section">
          <div className="section-title">Translation Mode</div>
          <div className="checkbox">
            <input
              id="text-only"
              type="radio"
              name="translation-mode"
              checked={mode === 'text-only'}
              onChange={() => {
                setMode('text-only');
              }}
            />
            <label htmlFor="text-only" style={{ margin: 0, fontWeight: 500 }}>
              Translate PDF text only
            </label>
          </div>
          <div className="checkbox">
            <input
              id="text-images"
              type="radio"
              name="translation-mode"
              checked={mode === 'text-images'}
              onChange={() => {
                setMode('text-images');
              }}
            />
            <label htmlFor="text-images" style={{ margin: 0, fontWeight: 500 }}>
              Translate PDF text + text inside images
            </label>
          </div>
          <label htmlFor="output-style" style={{ marginTop: 10 }}>Output Style</label>
          <select
            id="output-style"
            value={outputStyle}
            onChange={(e) => setOutputStyle(e.target.value as OutputStyle)}
          >
            <option value="clean">Clean Regenerated PDF (recommended)</option>
            <option value="overlay">Overlay on Original PDF (may look layered)</option>
          </select>
        </div>
      ) : null}

      <button className="primary-btn" type="button" onClick={handleSubmit} disabled={!canTranslate}>
        Translate PDF
      </button>

      <div className="progress panel">
        <div className="status-line">
          <span className={`status-chip ${progress.status}`}>{progress.status.toUpperCase()}</span>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          {file ? `Selected file: ${file.name}` : 'No file selected'}
        </p>
        <p>{progress.message}</p>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress.progress}%` }} />
        </div>
      </div>

      {progress.status === 'complete' && jobId ? (
        <div className="download">
          <a href={`/api/download/${jobId}`}>
            <button className="primary-btn" type="button">Download Translated PDF</button>
          </a>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
      {progress.error ? <p className="error">{progress.error}</p> : null}
    </div>
  );
}
