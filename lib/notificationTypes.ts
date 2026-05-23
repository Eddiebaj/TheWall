/**
 * Notification type constants and message builders for affiche social notifications.
 */

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'new_message'
  | 'friend_going'
  | 'event_reminder';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export function buildNotification(
  type: NotificationType,
  params: {
    actorName?: string;
    groupName?: string;
    eventName?: string;
  }
): Pick<NotificationPayload, 'title' | 'body'> {
  const { actorName = 'Someone', groupName = 'a group', eventName = 'an event' } = params;

  switch (type) {
    case 'friend_request':
      return {
        title: 'New friend request',
        body: `${actorName} sent you a friend request`,
      };
    case 'friend_accepted':
      return {
        title: 'Friend request accepted',
        body: `${actorName} accepted your friend request`,
      };
    case 'new_message':
      return {
        title: actorName,
        body: `${actorName} sent you a message in ${groupName}`,
      };
    case 'friend_going':
      return {
        title: 'Friend going tonight',
        body: `${actorName} is going to ${eventName} tonight`,
      };
    case 'event_reminder':
      return {
        title: 'Tonight reminder',
        body: `Don't forget -- ${eventName} is tonight`,
      };
  }
}

/** Map a notification type to the in-app route it should open. */
export function routeForNotification(
  type: NotificationType,
  data?: Record<string, string>
): string | null {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return '/(tabs)/friends';
    case 'new_message':
      return data?.conversation_id ? `/chat/${data.conversation_id}` : null;
    case 'friend_going':
    case 'event_reminder':
      return data?.event_id ? `/event/${data.event_id}` : null;
    default:
      return null;
  }
}
