import * as Localization from "expo-localization";
import { useMemo } from "react";

import { useAppStore } from "@/stores";
import en, { Dict } from "./en";
import ja from "./ja";
import zh from "./zh";

export type Locale = "en" | "zh" | "ja";
export type LocalePref = Locale | "system";

const DICTS: Record<Locale, Dict> = { en, zh, ja };

export function resolveLocale(pref: LocalePref): Locale {
  return resolveLocaleDebug(pref).locale;
}

export function resolveLocaleDebug(pref: LocalePref): {
  locale: Locale;
  raw: string;
} {
  if (pref !== "system") {
    return { locale: pref, raw: `pref:${pref}` };
  }

  try {
    const first = Localization.getLocales()[0] as
      | { languageCode?: string; languageTag?: string }
      | undefined;
    const raw = first?.languageCode || first?.languageTag || "";
    const tag = raw.toLowerCase();

    if (tag.startsWith("zh")) {
      return { locale: "zh", raw };
    }

    if (tag.startsWith("ja")) {
      return { locale: "ja", raw };
    }

    return { locale: "en", raw: raw || "(empty)" };
  } catch {
    // Native module unavailable (e.g. stale build) — fall through to English.
  }

  return { locale: "en", raw: "(unavailable)" };
}

function lookup(dict: Dict, key: string): string {
  const parts = key.split(".");
  let node: unknown = dict;

  for (const part of parts) {
    if (typeof node !== "object" || node === null || !(part in node)) {
      return key;
    }

    node = (node as Record<string, unknown>)[part];
  }

  return typeof node === "string" ? node : key;
}

export function formatVars(template: string, vars?: Record<string, string | number>): string {
  if (!vars) {
    return template;
  }

  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(String(v)),
    template,
  );
}

export function useT(): { t: (key: string, vars?: Record<string, string | number>) => string; locale: Locale } {
  const pref = useAppStore((s) => s.localePref);

  return useMemo(() => {
    const locale = resolveLocale(pref);
    const dict = DICTS[locale];

    return {
      locale,
      t: (key: string, vars?: Record<string, string | number>) =>
        formatVars(lookup(dict, key), vars),
    };
  }, [pref]);
}

export function tFor(pref: LocalePref): (key: string, vars?: Record<string, string | number>) => string {
  const dict = DICTS[resolveLocale(pref)];

  return (key, vars) => formatVars(lookup(dict, key), vars);
}
