/**
 * Create an account — his instruction of 18 Sept.
 *
 * **Its own screen, not a toggle on sign-in.** A form that changes what its
 * fields mean under the same title is the commonest way people submit the wrong
 * one — that is the SPEC's decision and this file is why it is cheap to keep.
 *
 * `POST /users/signup` takes `firstname`/`lastname` — one word, no underscore.
 *
 * ── EVERY ERROR NAMES ITS FIELD ───────────────────────────────────────────
 * Devise answers a bad signup with 400 and
 * `{ errors: [{ code, source: { pointer: "/data/attributes/<attr>" }, detail }] }`
 * (`registrations_controller.rb:17-27`), and `detail` is `error.message` —
 * the message WITHOUT its attribute: "has already been taken", "can't be
 * blank". Rendered as it arrived, this screen said "has already been taken"
 * and left the person to guess what had. The attribute is right there in
 * `source.pointer`; it is mapped onto the field it belongs to, drawn under
 * that field, and the sentence names it.
 *
 * And the server requires the LAST name (`user.rb:221`,
 * `validates :lastname, presence: true`) while this screen required only the
 * first — so a blank last name travelled to the server and came back as
 * "can't be blank", naming, again, no field. Every field the server requires
 * is now required here, before the request, against the field.
 */
import { useState } from "react";
import { View } from "react-native";
import { Link, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@/components/ScreenContainer";
import { Text } from "@/components/reusables/text";
import { Button } from "@/components/reusables/button";
import { Input } from "@/components/reusables/input";
import { useMetrics } from "@/hooks/useColors";
import { signUp } from "@/api/auth";
import { useAuthStore } from "@/stores/auth.store";
import { apiErrorMessage, isNetworkFailure } from "@/api/http";
import { t as translate } from "@/i18n";

type Field = "firstname" | "lastname" | "email" | "password";
const FIELDS: Field[] = ["firstname", "lastname", "email", "password"];

/**
 * Functions rather than constants: a constant is evaluated at import, before
 * the stored language has been read, and never again after a switch.
 */
const LABEL_KEYS: Record<Field, string> = {
  firstname: "signUp.firstName",
  lastname: "signUp.lastName",
  email: "signUp.email",
  password: "signUp.password",
};

/** What a blank field is told, against the field. */
const MISSING_KEYS: Record<Field, string> = {
  firstname: "signUp.missingFirstName",
  lastname: "signUp.missingLastName",
  email: "signUp.missingEmail",
  password: "signUp.missingPassword",
};

/** The one sentence for an untouched form — a flow asserts it word for word. */
export function emptyFormSentence(): string {
  return translate("signUp.emptyForm");
}

/** `/data/attributes/email` → "email"; the confirmation belongs to the password. */
function fieldFor(pointer: unknown): Field | null {
  if (typeof pointer !== "string") return null;
  const attribute = pointer.split("/").pop() ?? "";
  if (attribute === "password_confirmation") return "password";
  return (FIELDS as string[]).includes(attribute) ? (attribute as Field) : null;
}

/** "username" → "Username", "birth_date" → "Birth date". */
function humanize(attribute: string): string {
  const words = attribute.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Devise's errors, sorted onto their fields. Anything about an attribute this
 * form does not show — `username`, which the server derives; `base` — goes to
 * the general line WITH its attribute named, because "can't be blank" alone
 * is the sentence this file exists to stop.
 */
export function serverErrors(error: unknown): {
  fields: Partial<Record<Field, string>>;
  general: string[];
} | null {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  const errors = (data as { errors?: unknown })?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;

  const fields: Partial<Record<Field, string>> = {};
  const general: string[] = [];
  for (const item of errors) {
    const record = item as { detail?: unknown; source?: { pointer?: unknown } };
    if (typeof record.detail !== "string") continue;
    const field = fieldFor(record.source?.pointer);
    if (field) {
      // The first complaint about a field is the one that is drawn.
      fields[field] ??= `${translate(LABEL_KEYS[field])} ${record.detail}`;
    } else {
      const attribute = typeof record.source?.pointer === "string"
        ? record.source.pointer.split("/").pop() ?? ""
        : "";
      general.push(attribute && attribute !== "base" ? `${humanize(attribute)} ${record.detail}` : record.detail);
    }
  }
  return { fields, general };
}

export default function SignUp() {
  const metrics = useMetrics();
  const { t } = useTranslation();

  const [values, setValues] = useState<Record<Field, string>>({
    firstname: "",
    lastname: "",
    email: "",
    password: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (field: Field) => (text: string) => {
    setValues((current) => ({ ...current, [field]: text }));
    // Editing a field withdraws its complaint; the general line goes too.
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (error) setError(null);
  };

  async function submit() {
    if (busy) return;
    setError(null);
    setFieldErrors({});

    // Validated on press, before the request — every field the SERVER
    // requires, so nothing travels only to come back as "can't be blank".
    const missing = FIELDS.filter((field) => !values[field].trim());
    if (missing.length === FIELDS.length) {
      setError(emptyFormSentence());
      return;
    }
    if (missing.length > 0) {
      setFieldErrors(Object.fromEntries(missing.map((field) => [field, t(MISSING_KEYS[field])])));
      return;
    }

    setBusy(true);
    try {
      const user = await signUp({
        firstname: values.firstname,
        lastname: values.lastname,
        email: values.email,
        password: values.password,
      });
      // Devise signs the new account in, so this lands in the app rather than
      // back at a login the user has just proved they can pass.
      useAuthStore.setState({ user, status: "signedIn", signedOutReason: null });
      router.replace("/chat");
    } catch (e) {
      const parsed = serverErrors(e);
      if (parsed) {
        setFieldErrors(parsed.fields);
        if (parsed.general.length > 0) setError(parsed.general.join(". "));
        return;
      }
      setError(
        isNetworkFailure(e)
          ? t("failure.checkConnection")
          : (apiErrorMessage(e) ?? t("signUp.failed")),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll avoidKeyboard>
      <View style={{ flex: 1, justifyContent: "center", gap: metrics.space.xl, paddingVertical: metrics.space.xl }}>
        <View style={{ gap: metrics.space.sm }}>
          <Text variant="title">{t("signUp.title")}</Text>
          <Text tone="muted">{t("signUp.subtitle")}</Text>
        </View>

        <View style={{ gap: metrics.space.lg }}>
          <Input
            label={t(LABEL_KEYS.firstname)}
            value={values.firstname}
            onChangeText={setField("firstname")}
            autoCapitalize="words"
            autoComplete="given-name"
            error={fieldErrors.firstname}
            errorTestID="sign-up-error-firstname"
            testID="sign-up-firstname"
          />
          <Input
            label={t(LABEL_KEYS.lastname)}
            value={values.lastname}
            onChangeText={setField("lastname")}
            autoCapitalize="words"
            autoComplete="family-name"
            error={fieldErrors.lastname}
            errorTestID="sign-up-error-lastname"
            testID="sign-up-lastname"
          />
          <Input
            label={t(LABEL_KEYS.email)}
            value={values.email}
            onChangeText={setField("email")}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            error={fieldErrors.email}
            errorTestID="sign-up-error-email"
            testID="sign-up-email"
          />
          <Input
            label={t(LABEL_KEYS.password)}
            value={values.password}
            onChangeText={setField("password")}
            secure
            autoCapitalize="none"
            autoComplete="new-password"
            error={fieldErrors.password}
            errorTestID="sign-up-error-password"
            testID="sign-up-password"
          />

          {/* Only for what is not about ONE field: the untouched form, the
              network, and a server complaint about an attribute this form
              does not show. */}
          {error ? (
            <Text variant="caption" tone="danger" testID="sign-up-error">
              {error}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: metrics.space.lg }}>
          <Button label={t("signUp.submit")} busy={busy} onPress={() => void submit()} testID="sign-up-submit" />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: metrics.space.xs }}>
            <Text variant="caption" tone="muted">
              {t("signUp.haveAccount")}
            </Text>
            <Link href="/sign-in" asChild>
              <Text variant="caption" tone="accent" testID="sign-up-to-sign-in">
                {t("signUp.signIn")}
              </Text>
            </Link>
          </View>
        </View>
      </View>
    </Screen>
  );
}
