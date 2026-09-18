/**
 * PLACEHOLDER — the real chat is the next screen, per
 * `docs/design/chat/SPEC.md`.
 *
 * It is not empty on purpose. Sign-in cannot be tested end to end against a
 * screen that only says "coming soon": this one resolves the current session id
 * over the API and opens the socket, so reaching it proves the whole spine —
 * fingerprint, token, cable URL, subscription — actually works on a device,
 * which no unit test can establish.
 */
import { View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { useMetrics } from "@/hooks/useColors";
import { useAuthStore } from "@/stores/auth.store";
import { aiApi } from "@/api/ai";
import { useConversation } from "@/hooks/useConversation";

export default function Chat() {
  const metrics = useMetrics();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);

  const { data: sessionId, error } = useQuery({
    queryKey: ["ai", "currentSession"],
    queryFn: aiApi.currentSessionId,
  });

  const { messages, status } = useConversation({
    conversationId: sessionId ?? null,
    channel: "MessageChannel",
  });

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: "center", gap: metrics.space.lg }}>
        <Text variant="title">Assistant</Text>

        <View style={{ gap: metrics.space.xs }}>
          <Text tone="muted" testID="chat-signed-in-as">
            Signed in{user?.email ? ` as ${user.email}` : ""}.
          </Text>
          <Text tone="muted" testID="chat-session">
            {error
              ? "Could not reach MultiMagic."
              : sessionId
                ? `Session ${sessionId} · transcript ${status} · ${messages.length} messages`
                : "Opening your session…"}
          </Text>
        </View>

        <Text variant="answer">
          The conversation goes here. This placeholder exists so signing in can be proved
          end to end — reaching it means the token, the device fingerprint and the socket
          all worked.
        </Text>

        <Button
          label="Sign out"
          tone="neutral"
          onPress={() => {
            void signOut().then(() => router.replace("/sign-in"));
          }}
          testID="chat-sign-out"
        />
      </View>
    </Screen>
  );
}
