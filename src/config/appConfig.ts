/**
 * Central app identity config.
 *
 * Change the app name/tagline here ONLY — every screen (title tag, splash,
 * meeting invite text, notification titles, etc.) reads from this file
 * instead of hardcoding the brand name.
 */
export const appConfig = {
  name: 'GI MEET',
  tagline: 'Chat. Call. Meet.',
  shortDescription: 'Chat, call, and meet — all in one place.',

  // Used for meeting invite links: {origin}/meeting/{meetingCode}
  meetingCodeLength: 8,

  // File upload limits (Phase 3+ / Storage rules should mirror these)
  upload: {
    maxImageSizeMB: 10,
    maxFileSizeMB: 50,
    allowedFileTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ] as const,
  },
} as const;

export type AppConfig = typeof appConfig;
