import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';
import { DEV_AUTH_BYPASS } from '@/src/config/auth';
import {
  clearSessionBackup,
  isUsableSession,
  loadSessionBackup,
  saveSessionBackup,
} from '@/src/auth/authSessionBackup';

type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
};

type LoginInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  authReady: boolean;
  session: Session | null;
  user: User | null;
  fullName: string;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const devBypassUser = {
  id: 'dev-user',
  email: 'dev@kalendulu.local',
  user_metadata: {
    full_name: 'Dev Tester',
    name: 'Dev Tester',
  },
  app_metadata: {
    provider: 'dev-bypass',
  },
} as unknown as User;

async function fetchProfileName(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return '';
    }

    return data?.full_name ?? '';
  } catch {
    return '';
  }
}

function withAuthTimeout<T>(request: Promise<T>): Promise<T> {
  return Promise.race([
    request,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Die Anmeldung dauert zu lange. Bitte pruefe deine Internetverbindung und versuche es erneut.'));
      }, 15000);
    }),
  ]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [fullName, setFullName] = useState('');
  const authGenerationRef = useRef(0);
  const authRequestInFlightRef = useRef(false);
  const explicitSignOutRef = useRef(false);
  const lastAcceptedSessionAtRef = useRef(0);

  const user = DEV_AUTH_BYPASS ? devBypassUser : session?.user ?? null;

  const acceptSession = useCallback((nextSession: Session | null) => {
    if (nextSession?.user) {
      lastAcceptedSessionAtRef.current = Date.now();
      void saveSessionBackup(nextSession);
    }
    setSession(nextSession);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (DEV_AUTH_BYPASS) {
      setFullName('Dev Tester');
      return;
    }

    if (!user?.id) {
      setFullName('');
      return;
    }

    const profileName = await fetchProfileName(user.id);
    const fallbackName =
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      '';

    setFullName(profileName || fallbackName || '');
  }, [user]);

  useEffect(() => {
    let mounted = true;

    if (DEV_AUTH_BYPASS) {
      if (mounted) {
        setSession(null);
        setFullName('Dev Tester');
        setAuthReady(true);
      }
      return () => {
        mounted = false;
      };
    }

    const bootstrap = async () => {
      const bootstrapGeneration = authGenerationRef.current;

      try {
        const { data } = await supabase.auth.getSession();

        if (!mounted) return;
        if (bootstrapGeneration !== authGenerationRef.current) return;

        let bootSession = data.session;

        if (!isUsableSession(bootSession)) {
          const backupSession = await loadSessionBackup();
          if (!mounted) return;
          if (bootstrapGeneration !== authGenerationRef.current) return;

          if (backupSession) {
            const { data: restored } = await supabase.auth.setSession({
              access_token: backupSession.access_token,
              refresh_token: backupSession.refresh_token,
            });
            if (!mounted) return;
            if (bootstrapGeneration !== authGenerationRef.current) return;
            bootSession = restored.session ?? backupSession;
          }
        }

        acceptSession(bootSession);

        if (bootSession?.user?.id) {
          const profileName = await fetchProfileName(bootSession.user.id);
          if (!mounted) return;
          if (bootstrapGeneration !== authGenerationRef.current) return;

          const fallbackName =
            (bootSession.user.user_metadata?.full_name as string | undefined) ||
            (bootSession.user.user_metadata?.name as string | undefined) ||
            '';

          setFullName(profileName || fallbackName || '');
        } else {
          setFullName('');
        }

        if (mounted) {
          setAuthReady(true);
        }
      } catch {
        if (!mounted) return;
        if (bootstrapGeneration !== authGenerationRef.current) return;
        acceptSession(null);
        setFullName('');
        setAuthReady(true);
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const isStaleNullSession =
        !nextSession?.user &&
        (authRequestInFlightRef.current || Date.now() - lastAcceptedSessionAtRef.current < 10000) &&
        !explicitSignOutRef.current;

      if (isStaleNullSession) {
        setAuthReady(true);
        return;
      }

      if (!nextSession?.user && !explicitSignOutRef.current) {
        void loadSessionBackup()
          .then(async (backupSession) => {
            if (!backupSession) {
              acceptSession(null);
              setFullName('');
              setAuthReady(true);
              return;
            }

            const { data: restored } = await supabase.auth.setSession({
              access_token: backupSession.access_token,
              refresh_token: backupSession.refresh_token,
            });

            const restoredSession = restored.session ?? backupSession;
            acceptSession(restoredSession);

            const fallbackName =
              (restoredSession.user.user_metadata?.full_name as string | undefined) ||
              (restoredSession.user.user_metadata?.name as string | undefined) ||
              '';

            setFullName(fallbackName || '');
            setAuthReady(true);
          })
          .catch(() => {
            acceptSession(null);
            setFullName('');
            setAuthReady(true);
          });
        return;
      }

      acceptSession(nextSession);

      if (!nextSession?.user) {
        setFullName('');
      } else {
        const fallbackName =
          (nextSession.user.user_metadata?.full_name as string | undefined) ||
          (nextSession.user.user_metadata?.name as string | undefined) ||
          '';

        fetchProfileName(nextSession.user.id)
          .then((profileName) => {
            setFullName(profileName || fallbackName || '');
          })
          .catch(() => {
            setFullName(fallbackName || '');
          });
      }

      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [acceptSession]);

  const signIn = useCallback(async ({ email, password }: LoginInput) => {
    if (DEV_AUTH_BYPASS) return;

    explicitSignOutRef.current = false;
    authRequestInFlightRef.current = true;
    authGenerationRef.current += 1;

    try {
      const { data, error } = await withAuthTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        }),
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data.session) {
        acceptSession(data.session);
        setAuthReady(true);
      }
    } finally {
      authRequestInFlightRef.current = false;
    }
  }, [acceptSession]);

  const signUp = useCallback(async ({ email, password, fullName }: RegisterInput) => {
    if (DEV_AUTH_BYPASS) return;

    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();

    explicitSignOutRef.current = false;
    authRequestInFlightRef.current = true;
    authGenerationRef.current += 1;

    try {
      const { data, error } = await withAuthTimeout(
        supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: trimmedName,
            },
          },
        }),
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data.session) {
        acceptSession(data.session);
        setAuthReady(true);
      }
    } finally {
      authRequestInFlightRef.current = false;
    }
  }, [acceptSession]);

  const signOut = useCallback(async () => {
    if (DEV_AUTH_BYPASS) return;

    authRequestInFlightRef.current = false;
    explicitSignOutRef.current = true;
    authGenerationRef.current += 1;
    await clearSessionBackup();

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw new Error(error.message);
      }

      acceptSession(null);
      setFullName('');
      setAuthReady(true);
    } finally {
      explicitSignOutRef.current = false;
    }
  }, [acceptSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authReady,
      session,
      user,
      fullName: DEV_AUTH_BYPASS ? 'Dev Tester' : fullName,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [authReady, session, user, fullName, signIn, signUp, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  }

  return value;
}
