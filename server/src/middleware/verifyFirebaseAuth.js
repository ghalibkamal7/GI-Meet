import { auth } from '../services/firebaseAdmin.js';

export async function verifyFirebaseAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Missing Authorization header.' });
  }

  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired session. Please log in again.' });
  }
}
