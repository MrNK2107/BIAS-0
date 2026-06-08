import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { User } from 'firebase/auth';
import { onAuthChange, getIdTokenCurrent } from '../firebase/auth';

interface AuthState {
  user: User | null;
  idToken: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, idToken: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, idToken: null, loading: true });

  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      if (user) {
        const token = await getIdTokenCurrent();
        setState({ user, idToken: token, loading: false });
      } else {
        setState({ user: null, idToken: null, loading: false });
      }
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={state}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
