"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import styles from "@/components/settings/settings.module.css";
import { Avatar } from "@/components/site/Avatar";
import { ApiRequestError, api } from "@/lib/client/api";

const MAX_BYTES = 5 * 1024 * 1024;
const FRAME = 220;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

interface Pending {
  file: File;
  url: string;
  width: number;
  height: number;
}

/**
 * Upload, crop, replace or remove the profile picture. The crop is a square chosen with zoom and
 * position (drag, or arrow keys on the frame); the server decodes the file, re-encodes the square
 * and stores it. Canceling never touches the saved picture.
 */
export function AvatarEditor({ initialVersion }: { initialVersion: string | null }) {
  const { refresh } = useAuth();
  const [version, setVersion] = useState(initialVersion);
  const [pending, setPending] = useState<Pending | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "saved"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => () => {
    if (pending) URL.revokeObjectURL(pending.url);
  }, [pending]);

  const side = pending ? Math.min(pending.width, pending.height) / zoom : 0;
  const clampCenter = (x: number, y: number, size = side) => {
    if (!pending) return { x, y };
    return {
      x: Math.min(Math.max(x, size / 2), pending.width - size / 2),
      y: Math.min(Math.max(y, size / 2), pending.height - size / 2),
    };
  };

  function choose(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage({ kind: "error", text: "Pictures can be at most 5 MB." });
      return;
    }
    if (!TYPES.includes(file.type)) {
      setMessage({ kind: "error", text: "Use a JPEG, PNG or WebP image." });
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setPending({ file, url, width: image.naturalWidth, height: image.naturalHeight });
      setZoom(1);
      setCenter({ x: image.naturalWidth / 2, y: image.naturalHeight / 2 });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setMessage({ kind: "error", text: "That file couldn't be opened as a picture." });
    };
    image.src = url;
  }

  function cancel() {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
    setMessage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function save() {
    if (!pending) return;
    setBusy(true);
    setMessage(null);
    const size = Math.max(16, Math.floor(side));
    const { x, y } = clampCenter(center.x, center.y, size);
    const crop = {
      x: Math.max(0, Math.min(Math.round(x - size / 2), pending.width - size)),
      y: Math.max(0, Math.min(Math.round(y - size / 2), pending.height - size)),
      size,
    };
    try {
      const result = await api.uploadAvatar(pending.file, crop);
      setVersion(result.version);
      cancel();
      setMessage({ kind: "saved", text: "Picture saved." });
      void refresh();
    } catch (caught) {
      setMessage({ kind: "error", text: caught instanceof ApiRequestError ? caught.message : "Couldn't upload. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      await api.deleteAvatar();
      setVersion(null);
      setMessage({ kind: "saved", text: "Picture removed. The default picture shows instead." });
      void refresh();
    } catch (caught) {
      setMessage({ kind: "error", text: caught instanceof ApiRequestError ? caught.message : "Couldn't remove it. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const onKey = (event: React.KeyboardEvent) => {
    const step = side / 20;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCenter(clampCenter(center.x + move[0], center.y + move[1]));
    }
  };

  const scale = pending ? FRAME / side : 1;
  return (
    <div className={styles.avatarEditor} data-testid="avatar-editor">
      {pending ? (
        <div className={styles.crop}>
          <div
            className={styles.cropFrame}
            tabIndex={0}
            role="group"
            aria-label="Picture position. Drag, or use the arrow keys, to choose what's in the circle."
            onKeyDown={onKey}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, cx: center.x, cy: center.y };
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              setCenter(
                clampCenter(
                  drag.current.cx - (event.clientX - drag.current.x) / scale,
                  drag.current.cy - (event.clientY - drag.current.y) / scale,
                ),
              );
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            data-testid="avatar-crop"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
            <img
              src={pending.url}
              alt=""
              draggable={false}
              className={styles.cropImage}
              style={{
                width: pending.width * scale,
                height: pending.height * scale,
                transform: `translate(${-(center.x - side / 2) * scale}px, ${-(center.y - side / 2) * scale}px)`,
              }}
            />
            <span className={styles.cropMask} aria-hidden="true" />
          </div>
          <label className={styles.zoom}>
            <span className="field-label">Zoom</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(event) => {
                const next = Number(event.target.value);
                setZoom(next);
                if (pending) {
                  const size = Math.min(pending.width, pending.height) / next;
                  setCenter(clampCenter(center.x, center.y, size));
                }
              }}
              data-testid="avatar-zoom"
            />
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              className="btn btn-primary pending-track"
              onClick={() => void save()}
              disabled={busy}
              aria-busy={busy}
              data-testid="avatar-save"
            >
              {busy ? "Saving…" : "Save picture"}
            </button>
            <button type="button" className="btn" onClick={cancel} disabled={busy} data-testid="avatar-cancel">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.avatarCurrent}>
          <Avatar version={version} size="xlarge" label={version ? "Your picture" : "Default picture"} />
          <div className={styles.avatarButtons}>
            <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy} data-testid="avatar-choose">
              {version ? "Replace picture" : "Upload a picture"}
            </button>
            {version ? (
              <button type="button" className="btn btn-quiet" onClick={() => void remove()} disabled={busy} data-testid="avatar-remove">
                Remove picture
              </button>
            ) : null}
            <p className={styles.hint}>JPEG, PNG or WebP, up to 5 MB. Only you see it.</p>
          </div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="visually-hidden"
        tabIndex={-1}
        aria-label="Choose a picture"
        onChange={(event) => choose(event.target.files?.[0])}
        data-testid="avatar-file"
      />
      {message ? (
        <p
          className={message.kind === "error" ? "notice notice-error" : styles.saveNote}
          role={message.kind === "error" ? "alert" : "status"}
          data-testid="avatar-status"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
