import OpenAI from 'openai';
import { TranslateDirection, TranslationProvider } from '@/types';

interface TranslateOptions {
  direction: TranslateDirection;
  provider: TranslationProvider;
  openAiApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
}

export async function translateChunks(chunks: string[], options: TranslateOptions) {
  if (!chunks.length) return [];

  if (options.provider === 'openai' && options.openAiApiKey) {
    return translateWithOpenAI(chunks, options.direction, options.openAiApiKey);
  }

  if (options.provider === 'gemini' && options.geminiApiKey) {
    return translateWithGemini(chunks, options.direction, options.geminiApiKey);
  }

  if (options.provider === 'groq' && options.groqApiKey) {
    return translateWithGroq(chunks, options.direction, options.groqApiKey);
  }

  if (options.provider === 'openai') {
    throw new Error('OpenAI API key is missing. Please provide a valid OpenAI key.');
  }

  if (options.provider === 'gemini') {
    throw new Error('Gemini API key is missing. Please provide a valid Gemini key.');
  }

  throw new Error('Groq API key is missing. Please provide a valid Groq key.');
}

function logProviderError(provider: TranslationProvider, error: unknown, meta?: Record<string, unknown>) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[Danslator][translation:${provider}]`, {
    message: err.message,
    stack: err.stack,
    ...meta
  });
}

async function translateWithOpenAI(
  chunks: string[],
  direction: TranslateDirection,
  apiKey: string
): Promise<string[]> {
  try {
    const client = new OpenAI({ apiKey });
    const sourceLang = direction === 'en-ms' ? 'English' : 'Malay';
    const targetLang = direction === 'en-ms' ? 'Malay' : 'English';

  const prompt = [
    `Translate each array item from ${sourceLang} to ${targetLang}.`,
    'Rules:',
    '- Preserve numbering and punctuation.',
    '- Return valid JSON array only.',
    '- Keep empty strings as empty strings.'
  ].join('\n');

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: JSON.stringify({ texts: chunks }) }
      ]
    });

    const content = response.choices[0]?.message?.content ?? '{"texts":[]}';
    const parsed = JSON.parse(content) as { texts?: string[] };
    if (!parsed.texts || !Array.isArray(parsed.texts)) {
      throw new Error('OpenAI returned invalid translation payload');
    }
    return parsed.texts;
  } catch (error) {
    logProviderError('openai', error, { chunkCount: chunks.length });
    throw error;
  }
}

async function translateWithGemini(
  chunks: string[],
  direction: TranslateDirection,
  apiKey: string
): Promise<string[]> {
  try {
    const sourceLang = direction === 'en-ms' ? 'English' : 'Malay';
    const targetLang = direction === 'en-ms' ? 'Malay' : 'English';

  const prompt = [
    `Translate each array item from ${sourceLang} to ${targetLang}.`,
    'Rules:',
    '- Preserve numbering and punctuation.',
    '- Return valid JSON object with key "texts" only.',
    '- Keep empty strings as empty strings.'
  ].join('\n');

    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' +
      encodeURIComponent(apiKey);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${prompt}\n\n${JSON.stringify({ texts: chunks })}` }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini error (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{"texts":[]}';
    const parsed = JSON.parse(text) as { texts?: string[] };
    if (!parsed.texts || !Array.isArray(parsed.texts)) {
      throw new Error('Gemini returned invalid translation payload');
    }

    return parsed.texts;
  } catch (error) {
    logProviderError('gemini', error, { chunkCount: chunks.length });
    throw error;
  }
}

async function translateWithGroq(
  chunks: string[],
  direction: TranslateDirection,
  apiKey: string
): Promise<string[]> {
  try {
    const sourceLang = direction === 'en-ms' ? 'English' : 'Malay';
    const targetLang = direction === 'en-ms' ? 'Malay' : 'English';

  const prompt = [
    `Translate each array item from ${sourceLang} to ${targetLang}.`,
    'Rules:',
    '- Preserve numbering and punctuation.',
    '- Return valid JSON object with key "texts" only.',
    '- Keep empty strings as empty strings.'
  ].join('\n');

    const model = process.env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant';
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: JSON.stringify({ texts: chunks }) }
        ]
      })
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Groq error (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '{"texts":[]}';
    const parsed = JSON.parse(content) as { texts?: string[] };
    if (!parsed.texts || !Array.isArray(parsed.texts)) {
      throw new Error('Groq returned invalid translation payload');
    }

    return parsed.texts;
  } catch (error) {
    logProviderError('groq', error, { chunkCount: chunks.length });
    throw error;
  }
}
