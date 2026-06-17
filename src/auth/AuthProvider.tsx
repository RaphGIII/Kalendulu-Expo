import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/src/lib/supabase';
import { DEV_AUTH_BYPASS } from '@/src/config/auth';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [fullName, setFullName] = useState('');

  const user = DEV_AUTH_BYPASS ? devBypassUser : session?.user ?? null;

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
      try {
        const { data } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(data.session);

        if (data.session?.user?.id) {
          const profileName = await fetchProfileName(data.session.user.id);
          if (!mounted) return;

          const fallbackName =
            (data.session.user.user_metadata?.full_name as string | undefined) ||
            (data.session.user.user_metadata?.name as string | undefined) ||
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
        setSession(null);
        setFullName('');
        setAuthReady(true);
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);

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
  }, []);

  const signIn = async ({ email, password }: LoginInput) => {
    if (DEV_AUTH_BYPASS) return;

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const signUp = async ({ email, password, fullName }: RegisterInput) => {
    if (DEV_AUTH_BYPASS) return;

    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();

    const { error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName,
        },
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  const signOut = async () => {
    if (DEV_AUTH_BYPASS) return;

    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new Error(error.message);
    }
  };

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
    [authReady, session, user, fullName, refreshProfile]
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
