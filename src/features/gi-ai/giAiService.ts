import { authedFetch } from '../../services/authedFetch';

export async function summarizeConversation(parentType: 'chats' | 'groups', parentId: string): Promise<string> {
  const res = await authedFetch('/api/gi-ai/summarize-chat', {
    method: 'POST',
    body: JSON.stringify({ parentType, parentId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'GI AI could not summarize this conversation.');
  }
  const data = await res.json();
  return data.summary;
}

export async function summarizeMeeting(meetingCode: string): Promise<string> {
  const res = await authedFetch('/api/gi-ai/meeting-notes', {
    method: 'POST',
    body: JSON.stringify({ meetingCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? 'GI AI could not generate meeting notes.');
  }
  const data = await res.json();
  return data.summary;
}
