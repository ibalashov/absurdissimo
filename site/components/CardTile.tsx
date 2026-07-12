import Link from "next/link";

// One tile in a card grid (home deck feed).
// Plain markup, no handlers: renders on the server and inside client trees.
// prefetch={false}: tiles link to force-dynamic community threads, and a
// grid of them prefetching on viewport entry would hammer the backend.
export default function CardTile({
  href,
  imageSrc,
  word,
  sub,
  keyword,
}: {
  href: string;
  imageSrc: string | null;
  word: string;
  sub: string;
  // Sound-alike mnemonic keyword overlaid on the image (as in the app's home
  // grid); null for cards published before the server stored it.
  keyword?: string | null;
}) {
  return (
    <Link className="card" href={href} prefetch={false}>
      {imageSrc && (
        <span className="card-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={`Mnemonic illustration for ${word}`}
            loading="lazy"
          />
          {keyword && (
            <span className="card-keyword" dir="auto">
              {keyword}
            </span>
          )}
        </span>
      )}
      <span className="card-foot">
        <span className="card-word" dir="auto">
          {word}
        </span>
        <span className="card-sub">{sub}</span>
      </span>
    </Link>
  );
}
