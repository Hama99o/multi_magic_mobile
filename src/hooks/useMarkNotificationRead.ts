/**
 * Opening a notification marks it read, OPTIMISTICALLY (`docs/DATA_LAYER.md`
 * rule 3): the row loses its unread look and the badges (Home, the chat
 * header, the list's own count) drop by one at once; a refusal puts them
 * back; the list and the count are refetched after.
 *
 * Until 2026-11-13 the comment here said "optimistic, and put back on
 * failure" while the code had no `onMutate`: the row changed only when the
 * list reloaded. A failure still says nothing ON PURPOSE: the person pressed
 * a row to open it, not to mark it, and the refetch shows the truth.
 */
import { useMutation, useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import { notificationsApi, type NotificationPage } from "@/api/notifications";
import { notificationKeys } from "@/api/keys";

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      const keys: QueryKey[] = [notificationKeys.list(), notificationKeys.unreadCount()];
      await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
      const list = client.getQueryData<InfiniteData<NotificationPage>>(notificationKeys.list());
      const count = client.getQueryData<number>(notificationKeys.unreadCount());
      const now = new Date().toISOString();
      const wasUnread = Boolean(list?.pages.some((p) => p.notifications.some((n) => n.id === id && n.readAt == null)));
      if (list) {
        client.setQueryData<InfiniteData<NotificationPage>>(notificationKeys.list(), {
          ...list,
          pages: list.pages.map((p) => ({
            ...p,
            unreadCount: wasUnread ? Math.max(0, p.unreadCount - 1) : p.unreadCount,
            notifications: p.notifications.map((n) => (n.id === id && n.readAt == null ? { ...n, readAt: now } : n)),
          })),
        });
      }
      if (typeof count === "number" && (wasUnread || !list)) client.setQueryData<number>(notificationKeys.unreadCount(), Math.max(0, count - 1));
      return { list, count };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.list) client.setQueryData(notificationKeys.list(), ctx.list);
      if (typeof ctx?.count === "number") client.setQueryData(notificationKeys.unreadCount(), ctx.count);
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: notificationKeys.list() }),
        client.invalidateQueries({ queryKey: notificationKeys.unreadCount() }),
      ]),
  });
}
