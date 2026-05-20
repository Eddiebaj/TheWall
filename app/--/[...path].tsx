import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function CatchAll() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(tabs)');
  }, []);
  return null;
}
