import { authedFetch } from './authedFetch';

export interface GroupInvitePreview {
  id: string;
  name: string;
  description: string;
  membersCount: number;
  alreadyMember: boolean;
}

export interface CommunityInvitePreview {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  membersCount: number;
  groupsCount: number;
  alreadyMember: boolean;
}

async function responseError(response: Response): Promise<Error> {
  const result = await response.json().catch(() => null) as { message?: string } | null;
  return new Error(result?.message ?? 'The invitation request failed.');
}

export async function resolveGroupInvite(code: string): Promise<GroupInvitePreview> {
  const response = await authedFetch(`/api/invitations/resolve?type=group&code=${encodeURIComponent(code)}`);
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<GroupInvitePreview>;
}

export async function joinGroupInvite(code: string): Promise<string> {
  const response = await authedFetch('/api/invitations/join', {
    method: 'POST',
    body: JSON.stringify({ type: 'group', code }),
  });
  if (!response.ok) throw await responseError(response);
  const result = await response.json() as { id: string };
  return result.id;
}

export async function resolveCommunityInvite(code: string): Promise<CommunityInvitePreview> {
  const response = await authedFetch(`/api/invitations/resolve?type=community&code=${encodeURIComponent(code)}`);
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<CommunityInvitePreview>;
}

export async function joinCommunityInvite(code: string): Promise<string> {
  const response = await authedFetch('/api/invitations/join', {
    method: 'POST',
    body: JSON.stringify({ type: 'community', code }),
  });
  if (!response.ok) throw await responseError(response);
  const result = await response.json() as { id: string };
  return result.id;
}

export async function joinPublicCommunity(communityId: string): Promise<void> {
  const response = await authedFetch('/api/invitations/join', {
    method: 'POST',
    body: JSON.stringify({ type: 'community', communityId }),
  });
  if (!response.ok) throw await responseError(response);
}
