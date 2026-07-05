"use client";

import { useState } from "react";

// Some older cards reference images that have been evicted from the server's
// image cache (404). Hide the image element instead of showing a broken icon.
export default function CardImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="card-image"
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
