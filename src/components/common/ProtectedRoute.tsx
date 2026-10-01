import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';
import { saveRedirectTarget } from '../../utils/redirectAfterLogin';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading, needsProfileSetup } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner label="Getting things ready…" />;
  }

  if (!firebaseUser) {
    saveRedirectTarget(location.pathname);
    return <Navigate to="/login" replace />;
  }

  if (needsProfileSetup) {
    return <Navigate to="/setup-profile" replace />;
  }

  return <>{children}</>;
}