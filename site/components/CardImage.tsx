"use client";

import { useState } from "react";

// Some older cards reference images that have been evicted from the server's
// image cache (404). Hide the image element instead of showing a broken icon.
export default function CardImage({
  src,
  alt,
  className = "card-image",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
