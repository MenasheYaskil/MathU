import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  role: 'TEACHER' | 'STUDENT';
}

export default function ProtectedRoute({ role }: Props) {
  const token = useAuthStore((s) => s.token);
  const userRole = useAuthStore((s) => s.role);

  if (!token) return <Navigate to="/" replace />;
  if (userRole !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
