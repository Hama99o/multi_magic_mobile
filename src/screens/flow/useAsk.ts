/**
 * "Ask the assistant" about a board or a card: the question is COMPOSED in the
 * assistant's box and not sent (the app's rule, `app/notifications.tsx`), so
 * the person can change it first. The assistant already reads and changes
 * boards server-side (`McpServer::FlowTools`, `Ai::Records::Flow`).
 */
import { useNav } from "@/lib/nav";
import { useQuery } from "@tanstack/react-query";
import { aiApi } from "@/api/ai";
import { aiKeys } from "@/api/keys";
import { useDraft } from "@/hooks/useDraft";

export function useAsk() {
  const router = useNav();
  const { data: sessionId } = useQuery({ queryKey: aiKeys.currentSession(), queryFn: aiApi.currentSessionId });
  const { setDraft } = useDraft(sessionId ?? null);
  return (question: string) => {
    setDraft(question);
    router.push("/chat");
  };
}
