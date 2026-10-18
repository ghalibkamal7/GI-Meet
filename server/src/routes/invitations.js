import { verifyFirebaseAuth } from '../middleware/verifyFirebaseAuth.js';
import { db } from '../services/firebaseAdmin.js';
import { createInvitationRouter } from './invitationRouter.js';

export default createInvitationRouter({ db, verifyFirebaseAuth });
