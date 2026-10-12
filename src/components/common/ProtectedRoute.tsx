import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { ProfileLoadErrorScreen } from './ProfileLoadErrorScreen';
import { saveRedirectTarget } from '../../utils/redirectAfterLogin';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading, needsProfileSetup, profileError, retryProfileLoad } = useAuth();
  const location = useLocation();

  // `loading` covers BOTH "is anyone signed in?" and "does their profile exist?" — no redirect decisions before both are known.
  if (loading) {
    return <LoadingSpinner label="Getting things ready…" />;
  }

  if (!firebaseUser) {
    saveRedirectTarget(location.pathname);
    return <Navigate to="/login" replace />;
  }

  // The profile could not be READ (permissions/network). That is not the same as "no profile".
  if (profileError) {
    return <ProfileLoadErrorScreen error={profileError} onRetry={retryProfileLoad} />;
  }

  if (needsProfileSetup) {
    return <Navigate to="/setup-profile" replace />;
  }

  return <>{children}</>;
}