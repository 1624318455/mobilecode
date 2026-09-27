import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioPlayer } from "expo-audio";
import {
  EncodingType,
  cacheDirectory,
  deleteAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

import { edgeTtsBytesToBase64, synthesizeEdgeTts } from "@/lib/edgeTts";

export type SpeechStatus = "idle" | "loading" | "playing";

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function useEdgeSpeech() {
  const player = useAudioPlayer();
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);
  const lastUriRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const statusRef = useRef<SpeechStatus>("idle");

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      if (s.didJustFinish) {
        setStatus("idle");
      }
    });

    // NOTE: never call player.remove() here — useAudioPlayer owns the
    // native object lifetime (useReleasingSharedObject) and releases it
    // itself. And never touch the player unconditionally either: expo's
    // own cleanup may run before ours, so any call can hit an already
    // released object. Only pause when we actually started playback.
    return () => {
      sub.remove();

      if (statusRef.current !== "idle") {
        try {
          player.pause();
        } catch {
          // Already released; nothing to stop.
        }
      }
    };
  }, [player]);

  const stop = useCallback(() => {
    seqRef.current += 1;

    try {
      player.pause();
    } catch {
      // Player already released after unmount; nothing to stop.
    }

    if (mountedRef.current) {
      setStatus("idle");
    }
  }, [player]);

  const speak = useCallback(
    async (text: string) => {
      const seq = seqRef.current + 1;
      seqRef.current = seq;

      try {
        setError(null);
        setStatus("loading");

        try {
          player.pause();
        } catch {
          // Player already released; synthesize still proceeds, playback
          // is skipped below via the mounted check.
        }

        const bytes = await synthesizeEdgeTts({ text });

        if (!mountedRef.current || seq !== seqRef.current) {
          return;
        }

        if (!cacheDirectory) {
          throw new Error("No cache directory");
        }

        const uri = `${cacheDirectory}edge-tts-${Date.now()}.mp3`;
        await writeAsStringAsync(uri, edgeTtsBytesToBase64(bytes), {
          encoding: EncodingType.Base64,
        });

        if (!mountedRef.current || seq !== seqRef.current) {
          return;
        }

        const prev = lastUriRef.current;
        lastUriRef.current = uri;

        if (prev && prev !== uri) {
          deleteAsync(prev).catch(() => {
            // Best-effort cache cleanup.
          });
        }

        player.replace({ uri });
        player.play();
        setStatus("playing");
      } catch (err) {
        if (seq === seqRef.current) {
          setStatus("idle");
          setError(errorText(err));
        }
      }
    },
    [player],
  );

  return { status, error, speak, stop };
}
