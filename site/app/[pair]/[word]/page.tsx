import { notFound } from "next/navigation";

// Reserved routing skeleton for phase 1 (read-only word-pair pages).
// Canonical card-page URLs will live at /{pair}/{word}, e.g. /it-en/gatto.
// Until phase 1 ships the associations API, every such URL is a 404.
export default async function WordPairPage(_props: {
  params: Promise<{ pair: string; word: string }>;
}) {
  notFound();
}
