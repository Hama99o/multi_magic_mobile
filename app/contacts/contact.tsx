/**
 * One contact on a phone (`/contacts/contact?id=7`): the card, full screen.
 * The card itself is `src/screens/contacts/ContactCard.tsx`, shared with the
 * tablet split's right pane (`docs/design/contacts/SPEC.md` §C.11).
 */
import { useLocalSearchParams } from "expo-router";
import { ContactCard } from "@/screens/contacts/ContactCard";

export function parseId(raw: string | undefined): number | null {
  return raw && /^\d+$/.test(raw) ? Number(raw) : null;
}

export default function ContactDetail() {
  const params = useLocalSearchParams<{ id?: string }>();
  return <ContactCard contactId={parseId(params.id)} />;
}
