/**
 * Deleting the account — `docs/design/account/SPEC.md`.
 *
 * ── THE ENDPOINT DOES NOT EXIST, AND IT IS A GOOD THING IT WAS NEVER FINISHED ─
 * `config/routes.rb:267` is `resources :users, only: %i[index show update]`.
 * The abandoned attempt at `users_controller.rb:134` is commented out and reads:
 *
 *     # def destroy
 *     #   if @user.delete
 *
 * **`delete` is not `destroy`.** `User` has 57 associations, nearly all
 * `dependent: :destroy` — loans, expenses, incomes, budgets, contacts, notes,
 * documents, api keys, oauth tokens, trusted devices, login histories.
 * `@user.delete` skips callbacks and skips every one of them. It would return
 * 200, the person would believe they were gone, and their loans and contacts
 * would still be in the database with a dangling `user_id`: orphaned, unowned
 * and unreachable. That is the opposite of what he asked for.
 *
 * ── WHAT THIS FILE DOES UNTIL IT LANDS ────────────────────────────────────
 * It says so, in one constant, with the citation attached — and the screen
 * reads that constant rather than discovering the truth from a 404. **Nobody is
 * walked through typing their password into a wall.** The confirm still renders
 * in full, because what deletion WOULD remove is a disclosure worth reading
 * whether or not the button works today, and both stores ask for it.
 *
 * When the endpoint lands, `ACCOUNT_DELETION_AVAILABLE` flips and
 * `deleteAccount` is already written against the shape it must have.
 */
import { http } from "./http";

/**
 * Flip to `true` in the same commit that wires the endpoint.
 *
 * Deliberately a plain constant and not a feature flag from a server: an app
 * that asks the server whether deletion is possible cannot tell "not built yet"
 * from "the network is down", and those are opposite answers to give somebody
 * trying to leave.
 */
export const ACCOUNT_DELETION_AVAILABLE = false;

export class AccountDeletionUnavailable extends Error {
  constructor() {
    super("Account deletion is not available in the app yet.");
    this.name = "AccountDeletionUnavailable";
  }
}

/**
 * `DELETE /api/v1/users/me` — **self only, never by id.**
 *
 * The route must be scoped to `current_user`. An endpoint that takes an id
 * turns the API meant for self-service into a way to delete somebody else's
 * account, and that is a decision to make once, here, in writing, rather than
 * to discover from an authorisation bug.
 *
 * The password is re-sent rather than relied on from the session: the account
 * is reachable from a phone somebody else might be holding, and a valid token
 * is not evidence that the owner is the one pressing the button.
 */
export async function deleteAccount(password: string): Promise<void> {
  if (!ACCOUNT_DELETION_AVAILABLE) throw new AccountDeletionUnavailable();
  await http.delete("/api/v1/users/me", { data: { password } });
}

/**
 * What deletion removes, in the words the confirm screen uses.
 *
 * Named rather than summarised as "your data" — Tubi is the only one of the
 * eleven references that names what goes, and it is the one that reads like it
 * means it. Each line here maps to a `dependent: :destroy` on `User`.
 */
export const DELETED_WITH_ACCOUNT = [
  "Every conversation, and the files uploaded into them",
  "Your notes and documents",
  "Your contacts",
  "Your expenses, incomes, loans and budgets",
  "Your calendar events",
  "Saved devices, sign-in history and API keys",
] as const;

/**
 * The one exception, and why — `app/models/user.rb:77`,
 * `has_many :ai_usage_events, dependent: :nullify`.
 *
 * "Everything" with a stated exception is honest; "everything" with an unstated
 * one is not. Deletion detaches these rows rather than removing them, so what
 * survives is the cost and not the person.
 */
export const KEPT_AFTER_DELETION =
  "What the assistant cost — which provider ran, and how many tokens. Your name is removed from those rows, and they hold no part of any question or answer.";
