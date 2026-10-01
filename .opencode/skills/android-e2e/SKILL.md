---
name: android-e2e
description: Run MobileCode on-device E2E via Maestro MCP + adb + local opencode serve. Use when testing the app on the real phone, driving UI flows, or staging live reply/approval/TTS scenarios.
---

# Android E2E

Full runbook: `docs/e2e-runbook.md`. Read it before touching the device.

Environment: phone over wireless adb (`adb-ce0d7044-d9jp67._adb-tls-connect._tcp`),
`opencode serve` on `127.0.0.1:4096`, app server URL `http://127.0.0.1:4096`
(adb reverse), release APK pushed directly, Maestro MCP via `maestro mcp`.

Hard traps (all verified 2026-10-01):

1. `hideKeyboard` with the keyboard already down acts as BACK and silently
   exits forms. Call it only right after `inputText`.
2. `adb pair` on Windows cannot take piped stdin. Write the code to a file
   with `[IO.File]::WriteAllText` and redirect: `adb pair IP:PORT < file`.
   Codes expire within ~1 minute.
3. Maestro text matching is full-string regex. Same-name title/button must be
   tapped by hierarchy bounds center, never by screenshot eyeballing.
4. Phone must be left alone during automation; user foreground steals assertions.
5. New sessions take minutes to appear in recents; wait, then pull-to-refresh.
6. Always pass an explicit good model in `prompt_async`; sessions inherit the
   last (possibly broken) model otherwise.

Live staging one-liners and the verified verdict table live in the runbook §5/§7.
