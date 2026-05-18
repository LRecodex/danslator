import OpenAI from 'openai';
import { TranslateDirection } from '@/types';

export async function translateChunks(
  chunks: string[],
  direction: TranslateDirection,
  apiKey: string
) {
  if (!chunks.length) return [];
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
    throw new Error('Translation service returned an invalid response format');
  }

  return parsed.texts;
}
