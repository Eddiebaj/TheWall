import { supabase } from './supabase';

/**
 * Returns a Set of user IDs that have a block relationship with `userId`
 * in either direction (userId blocked them, or they blocked userId).
 */
export async function getBlockedIds(userId: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (!data?.length) return new Set();

  const ids = new Set<string>();
  for (const row of data) {
    if (row.blocker_id !== userId) ids.add(row.blocker_id);
    if (row.blocked_id !== userId) ids.add(row.blocked_id);
  }
  return ids;
}
