import {Navigate, useLocation} from 'react-router-dom';
import type {ReactNode} from 'react';
import {useAuth} from './AuthContext';

export function RequireAuth({children, admin = false}: {children: ReactNode; admin?: boolean}) {
  const {config, user} = useAuth();
  const location = useLocation();
  const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
  if (!config?.enabled) return admin ? <Navigate replace to="/learn"/> : children;
  if (!user) return <Navigate replace to={'/login?redirect=' + redirect}/>;
  if (user.passwordChangeRequired) return <Navigate replace to={'/change-password?redirect=' + redirect}/>;
  if (admin && user.role !== 'ROLE_ADMIN') return <Navigate replace to="/learn"/>;
  if (!admin && user.role === 'ROLE_ADMIN') return <Navigate replace to="/admin/overview"/>;
  return children;
}
