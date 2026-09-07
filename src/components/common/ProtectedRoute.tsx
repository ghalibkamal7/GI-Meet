import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingSpinner } from './LoadingSpinner';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading, needsProfileSetup } = useAuth();

  if (loading) {
    return <LoadingSpinner label="Getting things ready…" />;
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  if (needsProfileSetup) {
    return <Navigate to="/setup-profile" replace />;
  }

  return <>{children}</>;
}
