import { useEffect, useState } from "react";

interface ActiveRecording {
  recorder: MediaRecorder;
  stream: MediaStream;
  seq: number;
}

function pickMimeType(): string | undefined {
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      // ignore and try next
    }
  }
  return undefined;
}

/**
 * Hidden capture host page (loaded with ?capture=1). Receives record
 * commands from the main process, captures a desktop/window source via
 * Chromium's capture stack (GPU-composited pixels included), and streams
 * encoded chunks back. Never shown; renders nothing visible.
 */
export function CaptureHost() {
  const [error, setError] = useState<string | null>(null);
  const activeRef = { current: null as ActiveRecording | null };

  useEffect(() => {
    const api = window.captureHost;
    if (!api) {
      setError("capture bridge unavailable");
      return;
    }

    const offStart = api.onStart(async (cmd) => {
      try {
        if (activeRef.current) {
          api.notifyError("capture host busy");
          return;
        }
        // Electron-style mandatory constraints predate the standard
        // MediaTrackConstraints type — cast through unknown.
        const videoConstraints = {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: cmd.sourceId,
            minWidth: 640,
            maxWidth: cmd.width ?? 1920,
            minHeight: 360,
            maxHeight: cmd.height ?? 1080,
            minFrameRate: 10,
            maxFrameRate: cmd.fps ?? 30,
          },
        } as unknown as MediaTrackConstraints;
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });
        const mimeType = pickMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const active: ActiveRecording = { recorder, stream, seq: 0 };
        activeRef.current = active;
        recorder.ondataavailable = (event: BlobEvent) => {
          if (!event.data || event.data.size === 0) return;
          const seq = active.seq++;
          event.data.arrayBuffer().then(
            (buffer) => api.sendChunk(buffer, seq),
            () => api.notifyError("chunk serialization failed"),
          );
        };
        recorder.onerror = () => {
          api.notifyError("recorder error");
        };
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          activeRef.current = null;
          api.notifyStopped(active.seq - 1);
        };
        recorder.start(1000);
        api.notifyStarted({ mimeType: recorder.mimeType });
      } catch (err) {
        api.notifyError(err instanceof Error ? err.message : String(err));
      }
    });

    const offStop = api.onStop(() => {
      try {
        activeRef.current?.recorder.stop();
      } catch (err) {
        api.notifyError(err instanceof Error ? err.message : String(err));
      }
    });

    return () => {
      offStart();
      offStop();
    };
  }, []);

  return (
    <div style={{ background: "#0a0a0a", color: "#666", fontSize: "12px", padding: "1rem" }}>
      {error ? `Capture host error: ${error}` : "Capture host ready"}
    </div>
  );
}
