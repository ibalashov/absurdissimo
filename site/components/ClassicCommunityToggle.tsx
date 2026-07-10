"use client";

import { useEffect, useState } from "react";
import { MARKER_COOKIE } from "@/lib/preview";
import { ViewToggle } from "./ViewToggle";

// Classic-page community toggle, revealed only during an owner preview so the
// ISR classic page (revalidate = 3600) stays static for the public — reading
// the marker cookie server-side would force the page dynamic for everyone.
// First paint renders nothing (matching the server HTML, so no hydration
// mismatch); the effect then reveals the toggle if the non-httpOnly preview
// marker is present. The /c route is the real gate; this is cosmetic. On
// public launch, render <ViewToggle> directly again and delete this file.
export function ClassicCommunityToggle({
  pair,
  word,
}: {
  pair: string;
  word: string;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(
      document.cookie.split("; ").some((c) => c === `${MARKER_COOKIE}=1`),
    );
  }, []);
  if (!show) return null;
  return <ViewToggle pair={pair} word={word} active="classic" />;
}
