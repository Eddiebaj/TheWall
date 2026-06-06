import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; type?: string }>();

  useEffect(() => {
    const handle = async () => {
      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error && __DEV__) console.warn('[AuthCallback] exchangeCodeForSession error:', error.message);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/auth' as any);
        return;
      }

      if (params.type === 'recovery') {
        router.replace('/auth/reset-password' as any);
      } else {
        router.replace('/(tabs)/index' as any);
      }
    };

    handle();
  }, []);

  return null;
}
