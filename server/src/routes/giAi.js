import { Router } from 'express';
import { verifyFirebaseAuth } from '../middleware/verifyFirebaseAuth.js';
import { db } from '../services/firebaseAdmin.js';

const router = Router();

const AI_API_KEY = process.env.GI_AI_API_KEY; // e.g. an Anthropic API key
const AI_MODEL = process.env.GI_AI_MODEL || 'claude-sonnet-4-6';

function assertConfigured() {
  if (!AI_API_KEY) {
    throw new Error(
      'GI AI is not configured. Set GI_AI_API_KEY in server/.env to an API key for your LLM provider ' +
        '(this implementation calls the Anthropic Messages API by default).'
    );
  }
}

async function callLLM(prompt) {
  assertConfigured();
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': AI_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI provider error: ${body}`);
  }
  const data = await res.json();
  return data.content?.map((c) => c.text ?? '').join('\n') ?? '';
}

/**
 * Summarizes a chat or group conversation. This is only ever called when the
 * user explicitly asks (never triggered automatically on message arrival) —
 * see GI_AI.md for the reasoning.
 */
router.post('/summarize-chat', verifyFirebaseAuth, async (req, res) => {
  const { parentType, parentId, messageLimit } = req.body ?? {};
  if (!['chats', 'groups'].includes(parentType) || !parentId) {
    return res.status(400).json({ message: 'parentType (chats|groups) and parentId are required.' });
  }

  try {
    const snap = await db
      .collection(parentType)
      .doc(parentId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(Math.min(messageLimit ?? 100, 200))
      .get();

    const lines = snap.docs
      .reverse()
      .map((d) => {
        const m = d.data();
        if (m.deleted) return null;
        return `${m.senderId}: ${m.text || (m.attachment ? `[${m.attachment.type}: ${m.attachment.name}]` : '')}`;
      })
      .filter(Boolean)
      .join('\n');

    if (!lines) return res.json({ summary: 'No messages to summarize yet.' });

    const summary = await callLLM(
      `Summarize this conversation in 3-6 bullet points, then list any clear action items separately.\n\n${lines}`
    );
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Meeting "notes" are generated from the meeting CHAT text only — there is
 * no audio transcript in this build (that would need LiveKit Egress piped
 * through a speech-to-text service like Deepgram or Whisper, which is real
 * additional infrastructure, not just a config value). Documented clearly
 * so this doesn't look like it does more than it does.
 */
router.post('/meeting-notes', verifyFirebaseAuth, async (req, res) => {
  const { meetingCode } = req.body ?? {};
  if (!meetingCode) return res.status(400).json({ message: 'meetingCode is required.' });

  try {
    const snap = await db.collection('meetings').doc(meetingCode).collection('chat').orderBy('createdAt', 'asc').get();
    const lines = snap.docs.map((d) => `${d.data().senderName}: ${d.data().text}`).join('\n');

    if (!lines) {
      return res.json({ summary: 'No meeting chat to summarize. (Note: GI AI currently summarizes meeting chat text only, not spoken audio.)' });
    }

    const summary = await callLLM(
      `This is the in-meeting chat log (not a spoken transcript). Summarize key points and action items in bullet form.\n\n${lines}`
    );
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
