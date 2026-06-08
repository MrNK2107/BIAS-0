import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  getIdToken,
  User,
} from 'firebase/auth';
import { ensureFirebase, FirebaseConfigError, getConfigError } from './config';

export { FirebaseConfigError, getConfigError };

export { updateProfile };

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/api-key-not-valid':
    'Firebase API key is invalid. Copy frontend/.env.example to frontend/.env and fill in real values from your Firebase project, then restart the dev server.',
  'auth/invalid-api-key':
    'Firebase API key is invalid. Copy frontend/.env.example to frontend/.env and fill in real values from your Firebase project, then restart the dev server.',
  'auth/network-request-failed':
    'Network error. Check your internet connection and try again.',
  'auth/too-many-requests':
    'Too many failed attempts. Wait a moment and try again.',
  'auth/user-disabled':
    'This account has been disabled. Contact support.',
  'auth/user-not-found':
    'No account found with that email.',
  'auth/wrong-password':
    'Incorrect password. Try again or reset your password.',
  'auth/invalid-email':
    'That email address is not valid.',
  'auth/email-already-in-use':
    'An account with that email already exists. Try signing in instead.',
  'auth/weak-password':
    'Password is too weak. Use at least 6 characters.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
  'auth/popup-blocked':
    'Popup was blocked by your browser. Allow popups for this site and try again.',
  'auth/unauthorized-domain':
    "This domain isn't authorized for Google sign-in. Add it under Firebase Console -> Authentication -> Settings -> Authorized domains.",
  'auth/operation-not-allowed':
    'This sign-in method is not enabled. Enable it in Firebase Console -> Authentication -> Sign-in method.',
  'auth/invalid-credential':
    'Sign-in credentials are invalid or expired. Try again.',
  'auth/account-exists-with-different-credential':
    'An account already exists with the same email but a different sign-in method.',
  'auth/configuration-not-found':
    'Firebase Auth is not configured for this project. Enable Email/Password and Google sign-in in the Firebase Console.',
};

export function mapAuthError(err: unknown): string {
  if (err instanceof FirebaseConfigError) {
    return err.message;
  }
  const configErr = getConfigError();
  if (configErr) {
    return configErr.message;
  }
  const code = (err as { code?: string } | null)?.code;
  if (code && AUTH_ERROR_MESSAGES[code] !== undefined) {
    return AUTH_ERROR_MESSAGES[code];
  }
  const message = (err as { message?: string } | null)?.message;
  if (message) return message;
  return 'Authentication failed. Please try again.';
}

function auth() {
  return getAuth(ensureFirebase());
}

export function onAuthChange(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth(), cb);
}

export async function signup(email: string, password: string, name: string) {
  const cred = await createUserWithEmailAndPassword(auth(), email, password);
  await updateProfile(cred.user, { displayName: name });
  const idToken = await getIdToken(cred.user);
  return { user: cred.user, idToken };
}

export async function login(email: string, password: string) {
  const cred = await signInWithEmailAndPassword(auth(), email, password);
  const idToken = await getIdToken(cred.user);
  return { user: cred.user, idToken };
}

const _googleProvider = new GoogleAuthProvider();
_googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth(), _googleProvider);
  const idToken = await getIdToken(cred.user);
  return { user: cred.user, idToken };
}

export async function logout() {
  await signOut(auth());
}

export async function getIdTokenCurrent(): Promise<string | null> {
  const a = auth();
  const user = a.currentUser;
  if (!user) return null;
  return getIdToken(user);
}
