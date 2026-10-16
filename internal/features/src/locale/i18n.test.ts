import { describe, expect, it } from "vitest";
import i18n, { type LocaleCode, SUPPORTED_LOCALES } from "./i18n";

const expectedBackLabels = {
  de: "Zurück",
  en: "Back",
  es: "Volver",
  fr: "Retour",
  "pt-BR": "Voltar",
} satisfies Record<LocaleCode, string>;

const expectedAuthContinuationCopy = {
  de: {
    changeEmail: "Ändern",
    googleAccountDescription: "Diese E-Mail-Adresse verwendet Google.",
  },
  en: {
    changeEmail: "Change",
    googleAccountDescription: "This email uses Google.",
  },
  es: {
    changeEmail: "Cambiar",
    googleAccountDescription: "Este correo electrónico usa Google.",
  },
  fr: {
    changeEmail: "Modifier",
    googleAccountDescription: "Cette adresse e-mail utilise Google.",
  },
  "pt-BR": {
    changeEmail: "Alterar",
    googleAccountDescription: "Este e-mail usa o Google.",
  },
} satisfies Record<
  LocaleCode,
  { changeEmail: string; googleAccountDescription: string }
>;

describe("feature locales", () => {
  it.each(SUPPORTED_LOCALES)("resolves common.back in $code", ({ code }) => {
    expect(i18n.getFixedT(code)("common.back")).toBe(expectedBackLabels[code]);
  });

  it.each(SUPPORTED_LOCALES)(
    "resolves auth continuation copy in $code",
    ({ code }) => {
      const t = i18n.getFixedT(code);
      expect(t("auth.changeEmail")).toBe(
        expectedAuthContinuationCopy[code].changeEmail
      );
      expect(t("auth.googleAccountDescription")).toBe(
        expectedAuthContinuationCopy[code].googleAccountDescription
      );
    }
  );

  it.each(SUPPORTED_LOCALES)(
    "defines member capacity copy in $code",
    ({ code }) => {
      for (const key of [
        "organization.memberCapacity",
        "organization.memberCapacityUnlimited",
        "organization.memberCapacityReached",
      ]) {
        expect(i18n.getResource(code, "translation", key)).toBeTypeOf("string");
      }
    }
  );
});
