import type { ReviewReq, ReviewRes } from '@skak/shared';

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export const coachEnabled = !!OPENAI_KEY;

const MODE_LABEL: Record<string, string> = {
  '2p': 'standard two-player chess',
  '3p': 'a three-player free-for-all (three armies on a cross-shaped board)',
  '4p': 'a four-player free-for-all (four armies on a cross-shaped board)',
};

/** Ask OpenAI for a short, friendly post-game review. Server-side only. */
export async function reviewGame(req: ReviewReq): Promise<ReviewRes> {
  if (!OPENAI_KEY) {
    return { ok: false, error: 'Game review is not enabled on this server.' };
  }
  const transcript = (req.transcript || '').slice(0, 4000);
  if (!transcript.trim()) return { ok: false, error: 'No moves to review.' };

  const players = req.players.map((p) => `${p.color.toUpperCase()} = ${p.name}`).join(', ');
  const system =
    'You are a warm, encouraging chess coach giving a short post-game review to a casual player. ' +
    'Be specific but concise and friendly. Do not invent moves that are not in the transcript. ' +
    'Plain text only, no markdown headings.';
  const user =
    `This was ${MODE_LABEL[req.mode] ?? req.mode}. Players: ${players}. Result: ${req.result}.\n\n` +
    `Moves:\n${transcript}\n\n` +
    'Write a review of about 120-180 words: name a key moment or turning point, ' +
    'one thing the winner did well, and one concrete tip for improvement. End on an encouraging note.';

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 350,
        temperature: 0.7,
      }),
    });
    if (!res.ok) {
      console.error('OpenAI error', res.status, await res.text().catch(() => ''));
      return { ok: false, error: 'The coach is unavailable right now.' };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text ? { ok: true, text } : { ok: false, error: 'No review was generated.' };
  } catch (err) {
    console.error('reviewGame failed', err);
    return { ok: false, error: 'Could not reach the coach.' };
  }
}
