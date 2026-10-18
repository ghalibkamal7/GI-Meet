import { auth } from '../services/firebaseAdmin.js';
import { createVerifyFirebaseAuth } from './createVerifyFirebaseAuth.js';

export const verifyFirebaseAuth = createVerifyFirebaseAuth(auth);
