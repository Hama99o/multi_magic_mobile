/**
 * Followers and following — the web's `FollowListDrawer.tsx`, MANIFEST row 19.
 *
 * One screen, two tabs, opened on the one the profile row named
 * (`/follows?tab=followers`). Paged, a page more per press; the server's
 * order (newest relationship first) is kept. From "following" a person can
 * be unfollowed; from "followers" followed back. Unfollowing asks first:
 * it is the one that takes something away.
 */
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LoadFailure } from "@/components/LoadFailure";
import { failureMessage } from "@/api/failure";
import { profileKeys } from "@/api/keys";
import { profileApi, type Profile } from "@/api/profile";
import { followsApi } from "@/api/follows";
import { Avatar } from "@/screens/people/Avatar";
import { AccountHeader, Card, RowAction, confirmDestructive } from "@/components/settings/AccountUi";

type Tab = "followers" | "following";

function TabButton({ tab, active, label, onPress }: { tab: Tab; active: boolean; label: string; onPress: () => void }) {
  const colors = useColors();
  const metrics = useMetrics();
  return (
    <Pressable
      testID={`follows-tab-${tab}`}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={{
        flex: 1,
        minHeight: metrics.touch,
        alignItems: "center",
        justifyContent: "center",
        borderBottomWidth: 2,
        borderBottomColor: active ? colors.accent : "transparent",
      }}
    >
      <Text variant="label" tone={active ? "default" : "muted"}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function Follows() {
  const colors = useColors();
  const metrics = useMetrics();
  const { t } = useTranslation();
  const client = useQueryClient();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === "following" ? "following" : "followers");
  const [failure, setFailure] = useState<string | null>(null);

  const me = useQuery({ queryKey: profileKeys.me(), queryFn: profileApi.me });
  const userId = me.data?.id ?? null;

  const list = useInfiniteQuery({
    queryKey: profileKeys.follows(tab),
    queryFn: ({ pageParam }) => followsApi.list(userId!, tab, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: userId != null,
  });

  const settle = () => {
    setFailure(null);
    void client.invalidateQueries({ queryKey: ["follows"] });
    void client.invalidateQueries({ queryKey: profileKeys.me() });
  };
  const follow = useMutation({ mutationFn: (id: number) => followsApi.follow(id), onSuccess: settle, onError: (e) => setFailure(failureMessage(e, t("follows.failed"))) });
  const unfollow = useMutation({ mutationFn: (id: number) => followsApi.unfollow(id), onSuccess: settle, onError: (e) => setFailure(failureMessage(e, t("follows.failed"))) });
  const busy = follow.isPending || unfollow.isPending;

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const counts = me.data as Profile | undefined;

  return (
    <Screen measure scroll>
      <AccountHeader title={tab === "followers" ? t("follows.followers") : t("follows.following")} />
      <View accessibilityRole="tablist" style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TabButton
          tab="followers"
          active={tab === "followers"}
          label={t("profileMore.followers", { count: counts?.followersCount ?? 0 })}
          onPress={() => setTab("followers")}
        />
        <TabButton
          tab="following"
          active={tab === "following"}
          label={t("profileMore.following", { count: counts?.followingCount ?? 0 })}
          onPress={() => setTab("following")}
        />
      </View>

      <LoadFailure
        error={list.error ?? me.error}
        loadFailed={t("follows.loadFailed")}
        hasData={Boolean(list.data)}
        updatedAt={list.dataUpdatedAt}
        onRetry={() => void (me.data ? list.refetch() : me.refetch())}
        testID="follows-failed"
      />
      {failure ? (
        <Text testID="follows-error" tone="danger" variant="caption" style={{ marginTop: metrics.space.sm }}>
          {failure}
        </Text>
      ) : null}

      {list.data && rows.length === 0 ? (
        <Text tone="muted" testID="follows-empty" style={{ marginTop: metrics.space.lg }}>
          {tab === "followers" ? t("follows.followersEmpty") : t("follows.followingEmpty")}
        </Text>
      ) : null}

      {rows.length > 0 ? (
        <View style={{ marginTop: metrics.space.lg }}>
          <Card testID={`follows-list-${tab}`}>
            {rows.map((person, i) => (
              <View
                key={person.id}
                testID={`follows-person-${person.id}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: metrics.space.md,
                  paddingHorizontal: metrics.space.lg,
                  paddingVertical: metrics.space.sm,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <Avatar name={person.name} uri={person.avatar} userId={person.id} size={40} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{person.name}</Text>
                  {person.username ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {`@${person.username}`}
                    </Text>
                  ) : null}
                </View>
                {tab === "following" || person.isFollowing ? (
                  <RowAction
                    testID={`follows-unfollow-${person.id}`}
                    label={t("follows.unfollow")}
                    tone="danger"
                    disabled={busy}
                    accessibilityLabel={`${t("follows.unfollow")}: ${person.name}`}
                    onPress={() => confirmDestructive(`${t("follows.unfollow")}: ${person.name}`, "", t("follows.unfollow"), () => unfollow.mutate(person.id))}
                  />
                ) : (
                  <RowAction
                    testID={`follows-follow-${person.id}`}
                    label={t("follows.followBack")}
                    disabled={busy}
                    accessibilityLabel={`${t("follows.followBack")}: ${person.name}`}
                    onPress={() => follow.mutate(person.id)}
                  />
                )}
              </View>
            ))}
          </Card>
        </View>
      ) : null}

      {list.hasNextPage ? (
        <View style={{ marginTop: metrics.space.sm }}>
          <RowAction
            testID="follows-more"
            label={t("security.showMore")}
            disabled={list.isFetchingNextPage}
            onPress={() => void list.fetchNextPage()}
          />
        </View>
      ) : null}
    </Screen>
  );
}
