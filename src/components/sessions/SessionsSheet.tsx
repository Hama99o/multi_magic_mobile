/**
 * The conversations — a SHEET, not a drawer.
 *
 * An app with one destination does not need a persistent drawer; the title bar
 * carries a list icon and this slides up over the conversation.
 *
 * ── The row menu's order is a safety mechanism ────────────────────────────
 * **Clear messages · Rename · Delete**, in that order, and Clear is first on
 * purpose. `POST :clear` empties the transcript and KEEPS the session and its
 * files — it is the non-destructive answer to "this chat got messy", which is
 * what most delete presses actually mean.
 *
 * Offering the safe action first is a better safety mechanism than a better
 * warning: it makes the destructive confirm RARE, and a confirm somebody reads
 * once a month is read, while one they dismiss daily is not.
 */
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react-native";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useColors, useMetrics } from "@/hooks/useColors";
import { LIMITS, sessionsApi, type AiSession } from "@/api/ai";
import { apiErrorMessage } from "@/api/http";
import { isToday } from "@/lib/relativeTime";
import { SessionRow } from "./SessionRow";
import { RenameDialog } from "./RenameDialog";
import { DeleteConfirm } from "./DeleteConfirm";
import { InstructionsDialog, ScopeDialog } from "./SessionOptionsDialogs";

type Pending =
  | { kind: "rename" | "delete" | "menu" | "instructions" | "scope"; session: AiSession }
  | null;

export function SessionsSheet({
  visible,
  activeId,
  onClose,
  onOpenSession,
  onSignOut,
}: {
  visible: boolean;
  activeId: number | null;
  onClose: () => void;
  onOpenSession: (id: number) => void;
  onSignOut: () => void;
}) {
  const colors = useColors();
  const metrics = useMetrics();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["ai", "sessions"],
    queryFn: sessionsApi.list,
    enabled: visible,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["ai", "sessions"] });

  const create = useMutation({
    mutationFn: () => sessionsApi.create(),
    onSuccess: (session) => {
      void refresh();
      onOpenSession(session.id);
      onClose();
    },
    onError: (e) => setError(apiErrorMessage(e) ?? "Could not start a new conversation."),
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => sessionsApi.rename(id, title),
    onSuccess: () => {
      void refresh();
      setPending(null);
    },
    onError: (e) => setError(apiErrorMessage(e) ?? "Could not rename that conversation."),
  });

  const setInstructions = useMutation({
    mutationFn: ({ id, instructions }: { id: number; instructions: string }) =>
      sessionsApi.update(id, { instructions }),
    onSuccess: () => {
      void refresh();
      setPending(null);
    },
    onError: (e) => setError(apiErrorMessage(e) ?? "Could not save those instructions."),
  });

  const setScope = useMutation({
    mutationFn: ({ id, apps }: { id: number; apps: string[] }) => sessionsApi.update(id, { apps }),
    onSuccess: () => {
      void refresh();
      setPending(null);
    },
    onError: (e) => setError(apiErrorMessage(e) ?? "Could not change what this chat searches."),
  });

  const clear = useMutation({
    mutationFn: (id: number) => sessionsApi.clear(id),
    onSuccess: () => {
      void refresh();
      // The open conversation's transcript just emptied server-side.
      void queryClient.invalidateQueries({ queryKey: ["ai", "currentSession"] });
      setPending(null);
    },
    onError: (e) => setError(apiErrorMessage(e) ?? "Could not clear that conversation."),
  });

  const destroy = useMutation({
    mutationFn: (id: number) => sessionsApi.destroy(id),
    onSuccess: (fallback) => {
      void refresh();
      setPending(null);
      // The server never leaves the user with nowhere to talk, and hands back
      // the session to fall back to — so the caller does not create one.
      onOpenSession(fallback.id);
    },
    onError: (e) => setError(apiErrorMessage(e) ?? "Could not delete that conversation."),
  });

  if (!visible) return null;

  const atLimit = sessions.length >= LIMITS.maxSessions;
  const today = sessions.filter((s) => isToday(s.updatedAt));
  const earlier = sessions.filter((s) => !isToday(s.updatedAt));

  const group = (label: string, rows: AiSession[]) =>
    rows.length === 0 ? null : (
      <View key={label} style={{ gap: metrics.space.xs }}>
        <Text variant="label" tone="muted" style={{ paddingHorizontal: metrics.space.sm }}>
          {label}
        </Text>
        {rows.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            active={session.id === activeId}
            onOpen={() => {
              onOpenSession(session.id);
              onClose();
            }}
            onMenu={() => setPending({ kind: "menu", session })}
          />
        ))}
      </View>
    );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: colors.ground,
            borderTopLeftRadius: metrics.radius.lg,
            borderTopRightRadius: metrics.radius.lg,
            paddingTop: metrics.space.lg,
            paddingHorizontal: metrics.space.lg,
            paddingBottom: metrics.space.xl,
            gap: metrics.space.lg,
            maxHeight: "85%",
            width: "100%",
            maxWidth: metrics.maxMeasure,
            alignSelf: "center",
          }}
          testID="sessions-sheet"
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text variant="title" style={{ flex: 1 }}>
              Conversations
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
              style={{ width: metrics.touch, height: metrics.touch, alignItems: "center", justifyContent: "center" }}
              testID="sessions-close"
            >
              <X size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          {error ? (
            <Text variant="caption" tone="danger" testID="sessions-error">
              {error}
            </Text>
          ) : null}

          {isLoading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <ScrollView contentContainerStyle={{ gap: metrics.space.lg }}>
              {group("Today", today)}
              {group("Earlier", earlier)}
            </ScrollView>
          )}

          {/* Cleo's pinned primary at the bottom. */}
          <View style={{ gap: metrics.space.sm }}>
            {atLimit ? (
              <Text variant="caption" tone="muted" testID="sessions-at-limit">
                You have {LIMITS.maxSessions} conversations, which is the most MultiMagic keeps.
                Delete one to start another.
              </Text>
            ) : null}
            <Button
              label="New conversation"
              busy={create.isPending}
              disabled={atLimit}
              onPress={() => create.mutate()}
              testID="sessions-new"
            />

            {/* ── ACCOUNT ─────────────────────────────────────────────────
                Under its own heading and BELOW a divider, deliberately apart
                from the conversation list above it.

                Two rows from here sits "delete a conversation", which is safe
                by construction: the confirm exists to say that notes, contacts,
                loans and money are untouched. Deleting the ACCOUNT is the
                opposite — it is those records. They must not read as siblings,
                so this one does not live inside the list of conversations; it
                lives under a heading that names what it is about, and it opens
                its own SCREEN rather than a dialog. */}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: metrics.space.md,
                gap: metrics.space.xs,
              }}
            >
              <Text variant="label" tone="muted" style={{ paddingHorizontal: metrics.space.sm }}>
                Account
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  router.push("/account");
                }}
                style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}
                testID="sessions-account"
              >
                <Text>Privacy and account</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={onSignOut}
                hitSlop={8}
                style={{ minHeight: metrics.touch, justifyContent: "center", paddingHorizontal: metrics.space.sm }}
                testID="sessions-sign-out"
              >
                <Text tone="muted">Sign out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* The row menu. Clear FIRST — see the header. */}
      {pending?.kind === "menu" ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setPending(null)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            onPress={() => setPending(null)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: metrics.space.xl }}
          >
            <View
              style={{
                backgroundColor: colors.ground,
                borderRadius: metrics.radius.lg,
                padding: metrics.space.lg,
                gap: metrics.space.xs,
                width: "100%",
                maxWidth: 360,
                alignSelf: "center",
              }}
              testID="session-menu"
            >
              <Text variant="label" tone="muted" numberOfLines={1}>
                {pending.session.title}
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => clear.mutate(pending.session.id)}
                style={{ minHeight: metrics.touch, justifyContent: "center" }}
                testID="session-menu-clear"
              >
                <Text>Clear messages</Text>
                <Text variant="caption" tone="muted">
                  Empties this chat. Its files stay.
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setPending({ kind: "rename", session: pending.session })}
                style={{ minHeight: metrics.touch, justifyContent: "center" }}
                testID="session-menu-rename"
              >
                <Text>Rename</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setPending({ kind: "scope", session: pending.session })}
                style={{ minHeight: metrics.touch, justifyContent: "center" }}
                testID="session-menu-scope"
              >
                <Text>Search in</Text>
                <Text variant="caption" tone="muted">
                  {pending.session.apps.length === 0
                    ? "All apps"
                    : `${pending.session.apps.length} apps`}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setPending({ kind: "instructions", session: pending.session })}
                style={{ minHeight: metrics.touch, justifyContent: "center" }}
                testID="session-menu-instructions"
              >
                <Text>How to answer</Text>
                <Text variant="caption" tone="muted">
                  {pending.session.instructions ? "Set" : "Not set"}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => setPending({ kind: "delete", session: pending.session })}
                style={{ minHeight: metrics.touch, justifyContent: "center" }}
                testID="session-menu-delete"
              >
                <Text tone="danger">Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Modal>
      ) : null}

      <RenameDialog
        visible={pending?.kind === "rename"}
        initialTitle={pending?.session.title ?? ""}
        busy={rename.isPending}
        onCancel={() => setPending(null)}
        onSave={(title) =>
          pending && rename.mutate({ id: pending.session.id, title })
        }
      />

      <InstructionsDialog
        visible={pending?.kind === "instructions"}
        initial={pending?.session.instructions ?? ""}
        busy={setInstructions.isPending}
        onCancel={() => setPending(null)}
        onSave={(instructions) =>
          pending && setInstructions.mutate({ id: pending.session.id, instructions })
        }
      />

      <ScopeDialog
        visible={pending?.kind === "scope"}
        initial={pending?.session.apps ?? []}
        busy={setScope.isPending}
        onCancel={() => setPending(null)}
        onSave={(apps) => pending && setScope.mutate({ id: pending.session.id, apps })}
      />

      <DeleteConfirm
        visible={pending?.kind === "delete"}
        fileCount={pending?.session.documentCount ?? 0}
        busy={destroy.isPending}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && destroy.mutate(pending.session.id)}
      />
    </Modal>
  );
}
