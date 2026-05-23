import { supabase } from './supabase';

export async function sendNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  sound?: boolean,
  priority?: string
): Promise<void> {
  await supabase.functions.invoke('send-notification', {
    body: { user_id: userId, type, title, body, data, sound, priority },
  });
}
