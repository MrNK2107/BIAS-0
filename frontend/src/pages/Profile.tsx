import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Mail,
  Calendar,
  Edit3,
  Save,
  X,
  LogOut,
  FolderOpen,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { logout, updateProfile as fbUpdateProfile, mapAuthError } from '../firebase/auth';
import { useAppContext } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import EmptyState from '../components/EmptyState';

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+|@/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatJoinDate(ts: string | undefined): string {
  if (!ts) return 'Unknown';
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const { projects, refreshProjects, setProjectId } = useAppContext();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (user) setNewName(user.displayName ?? '');
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { replace: true });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  if (authLoading || !user) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <p className="helper">Loading your profile...</p>
      </div>
    );
  }

  const initials = getInitials(user.displayName, user.email);
  const joinDate = formatJoinDate(user.metadata.creationTime);

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await fbUpdateProfile(user, { displayName: newName.trim() });
      showToast('Display name updated.', 'success');
      setEditing(false);
    } catch (err) {
      showToast(mapAuthError(err) || 'Could not update name.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      showToast('Signed out.', 'info');
      navigate('/login', { replace: true });
    } catch (err) {
      showToast(mapAuthError(err) || 'Sign out failed.', 'error');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', paddingBottom: 80 }}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="page-header"
      >
        <div>
          <div className="kicker">Account</div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">
            Manage your identity, see your projects, and sign out across sessions.
          </p>
        </div>
      </motion.div>

      <div className="profile-grid">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="card"
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              paddingBottom: 24,
              borderBottom: '1px solid var(--border-faint)',
            }}
          >
            <div aria-hidden className="profile-avatar">{initials}</div>

            {!editing ? (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div className="profile-name">
                    {user.displayName || user.email?.split('@')[0] || 'User'}
                  </div>
                  {user.email && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        marginTop: 4,
                      }}
                    >
                      {user.email}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-small"
                  onClick={() => setEditing(true)}
                >
                  <Edit3 size={14} /> Edit name
                </button>
              </>
            ) : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label
                  className="profile-field-label"
                  style={{ display: 'block' }}
                >
                  Display name
                </label>
                <input
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Your name"
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-small"
                    onClick={handleSaveName}
                    disabled={saving || !newName.trim()}
                    style={{ flex: 1 }}
                  >
                    <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setEditing(false);
                      setNewName(user.displayName ?? '');
                    }}
                    disabled={saving}
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="profile-fields">
            <Field icon={<Mail size={15} />} label="Email" value={user.email ?? '—'} />
            <Field
              icon={<Calendar size={15} />}
              label="Member since"
              value={joinDate}
            />
            <Field
              icon={<ShieldCheck size={15} />}
              label="Auth provider"
              value={
                user.providerData[0]?.providerId === 'google.com'
                  ? 'Google'
                  : 'Email & Password'
              }
            />
          </div>

          <div className="profile-section-divider" />

          <button
            className="btn"
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              width: '100%',
              color: 'var(--warning)',
              borderColor: 'rgba(162, 74, 70, 0.32)',
            }}
          >
            <LogOut size={15} /> {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="card"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              marginBottom: 24,
            }}
          >
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>
                My Projects
              </div>
              <p className="helper" style={{ fontSize: '0.85rem', margin: 0 }}>
                {projects.length === 0
                  ? 'Create your first project to begin auditing.'
                  : `${projects.length} project${projects.length === 1 ? '' : 's'} on file`}
              </p>
            </div>
            <Link to="/dashboard" className="btn btn-small">
              Open selector <ArrowRight size={13} />
            </Link>
          </div>

          {projects.length === 0 ? (
            <EmptyState
              compact
              icon={<FolderOpen size={26} />}
              title="No projects yet"
              description="Projects let you organize audits by dataset or domain. Create one from the project selector in the top bar to get started."
              primaryAction={{ label: 'Go to Dashboard', to: '/dashboard' }}
            />
          ) : (
            <div className="stack stack-md">
              {projects.map((p) => (
                <div key={p.id} className="profile-project-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="profile-project-name">{p.name}</div>
                    <div className="profile-project-meta">
                      {p.domain || 'general'} · {p.sensitive_columns?.length ?? 0} sensitive
                      attribute
                      {(p.sensitive_columns?.length ?? 0) === 1 ? '' : 's'}
                    </div>
                  </div>
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setProjectId(String(p.id));
                      navigate('/dashboard');
                    }}
                  >
                    Switch
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="profile-field-row">
      <div className="profile-field-icon">{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="profile-field-label">{label}</div>
        <div className="profile-field-value">{value}</div>
      </div>
    </div>
  );
}
