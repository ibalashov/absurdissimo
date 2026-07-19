"use client";

import { useEffect, useRef, useState } from "react";
import {
  pollAdminCardImage,
  regenerateAdminCardImage,
  type AdminCard,
} from "@/lib/admin";

export default function RegenerateImageButton({
  card,
  onReady,
}: {
  card: Pick<AdminCard, "association_id" | "image_id">;
  onReady: (card: AdminCard) => void;
}) {
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const run = useRef(0);

  useEffect(() => () => void run.current++, []);

  async function regenerate() {
    const token = ++run.current;
    const previousImageId = card.image_id;
    setPending(true);
    setNote(null);
    try {
      await regenerateAdminCardImage(card.association_id);
      const fresh = await pollAdminCardImage(
        card.association_id,
        onReady,
        () => run.current !== token,
      );
      if (fresh && fresh.image_id === previousImageId) {
        setNote("Image unchanged — try again.");
      }
    } catch (err) {
      if (run.current === token) {
        setNote(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      if (run.current === token) setPending(false);
    }
  }

  return (
    <>
      <button
        className="admin-btn"
        type="button"
        disabled={pending}
        onClick={() => void regenerate()}
      >
        {pending ? "Regenerating image…" : "Regenerate image"}
      </button>
      {note && <span className="admin-error">{note}</span>}
    </>
  );
}
