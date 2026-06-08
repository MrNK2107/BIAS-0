import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon, ChevronDown, LayoutDashboard, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { logout, mapAuthError } from '../firebase/auth';
import { useToast } from '../context/ToastContext';

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+|@/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getAvatarColor(seed: string): string {
  const palette = ['#C89D7C', '#A24A46', '#8E9196', '#b98c62', '#6b7280'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length];
}

export default function UserMenu() {
  const { user, loading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (loading || !user) return null;

  const name = user.displayName || user.email?.split('@')[0] || 'User';
  const email = user.email ?? '';
  const initials = getInitials(user.displayName, user.email);
  const color = getAvatarColor(user.uid);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      showToast('Signed out.', 'info');
      navigate('/login', { replace: true });
    } catch (err) {
      showToast(mapAuthError(err) || 'Sign out failed', 'error');
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="user-menu">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="user-menu-trigger"
      >
        <span
          aria-hidden
          className="user-menu-avatar"
          style={{ background: `linear-gradient(135deg, ${color}, rgba(255,255,255,0.04))` }}
        >
          {initials}
        </span>
        <span className="user-menu-name">{name}</span>
        <ChevronDown size={14} className="user-menu-caret" data-open={open} />
      </button>

      {open && (
        <div role="menu" className="user-menu-dropdown">
          <div className="user-menu-header">
            <div className="user-menu-header-name">{name}</div>
            {email && <div className="user-menu-header-email">{email}</div>}
          </div>

          <div className="user-menu-list">
            <Link to="/profile" role="menuitem" onClick={() => setOpen(false)} className="user-menu-item">
              <UserIcon size={15} />
              <span>My Profile</span>
            </Link>
            <Link to="/dashboard" role="menuitem" onClick={() => setOpen(false)} className="user-menu-item">
              <LayoutDashboard size={15} />
              <span>Dashboard</span>
            </Link>
            <Link to="/monitoring" role="menuitem" onClick={() => setOpen(false)} className="user-menu-item">
              <Activity size={15} />
              <span>Live Monitoring</span>
            </Link>

            <div className="user-menu-divider" />

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="user-menu-item user-menu-item-danger"
            >
              <LogOut size={15} />
              <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
