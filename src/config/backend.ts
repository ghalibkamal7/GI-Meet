/**
 * The Node backend (see /server) handles anything that needs a secret:
 * LiveKit token minting and the YouTube Live OAuth + broadcast pipeline.
 * Set this to wherever that backend is deployed (e.g. a Cloud Run URL).
 */
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';
