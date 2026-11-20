/** Finance › Expenses (SPEC F10-F13): the shared ledger, for expenses. `openId`: a link to one expense. */
import { Ledger } from "../Ledger";

export function ExpensesTab({ openId }: { openId?: number } = {}) {
  return <Ledger kind="expense" openId={openId} />;
}
