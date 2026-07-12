"use client";

// Starter pack manager (VocabCards #366): curate each pair's starter pack
// against the live server. Three panes — the current pack (ordered, with
// unselect and up/down reorder), corpus browse & select, and generate-a-card —
// all client-side against the admin API (lib/admin.ts; access is enforced
// server-side, the /admin layout gate only hides the shell). The pack itself
// is the shared state: browse/generate membership marks derive from it, and
// every mutation resyncs it from the server.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import CardImage from "@/components/CardImage";
import MnemonicText from "@/components/MnemonicText";
import {
  fetchPairsLive,
  languageFlag,
  languageName,
  type PairSummary,
} from "@/lib/api";
import {
  addToStarterPack,
  adminImageUrl,
  fetchAdminCard,
  fetchStarterPack,
  generateAdminCard,
  isAdminStatus,
  removeFromStarterPack,
  reorderStarterPack,
  searchAdminCards,
  type AdminCard,
  type AdminCardsPage,
} from "@/lib/admin";

// Advisory pack size (the app's starter deck aims for 12) — never enforced.
const PACK_TARGET = 12;
const IMAGE_POLL_MS = 3000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

// One association rendered with the site's card-tile look (globals.css .card
// classes + MnemonicText/CardImage), plus an actions row instead of a link.
function AdminTile({
  card,
  corner,
  children,
}: {
  card: AdminCard;
  corner?: ReactNode;
  children?: ReactNode;
}) {
  const img = card.image_url ? adminImageUrl(card.image_url) : null;
  return (
    <div className="card admin-tile">
      <span className="card-media">
        {img ? (
          <CardImage
            src={img}
            alt={`Mnemonic illustration for ${card.word}`}
            className=""
          />
        ) : (
          <span className="admin-tile-noimg">
            {card.image_status === "pending" ? "rendering…" : "no image"}
          </span>
        )}
        {card.keyword && (
          <span className="card-keyword" dir="auto">
            {card.keyword}
          </span>
        )}
      </span>
      <span className="card-foot">
        <span className="card-word" dir="auto">
          {card.display_word ?? card.word}
        </span>
        {corner}
      </span>
      <p className="admin-tile-mnemonic" dir="auto">
        <MnemonicText text={card.mnemonic} keyword={card.keyword} />
      </p>
      {children && <div className="admin-tile-actions">{children}</div>}
    </div>
  );
}

// ---- Pane 2: browse & select ------------------------------------------------

function BrowsePane({
  pair,
  packIds,
  onAdd,
}: {
  pair: string;
  // null while the pack hasn't loaded — fall back to the server's
  // in_starter_pack flag; once loaded the live pack is authoritative.
  packIds: Set<number> | null;
  onAdd: (associationId: number) => Promise<boolean>;
}) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminCardsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchAdminCards(pair, q, page)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pair, q, page]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.page_size))
    : 1;

  async function add(associationId: number) {
    setAddingId(associationId);
    await onAdd(associationId);
    setAddingId(null);
  }

  return (
    <section className="admin-pane">
      <h2>Browse &amp; select</h2>
      <p className="admin-pane-hint">
        Search the pair&rsquo;s corpus by word. Every association is listed
        separately, so alternative cards of the same word are individually
        selectable.
      </p>
      <form
        className="admin-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input.trim());
          setPage(1);
        }}
      >
        <input
          className="admin-input"
          type="search"
          placeholder="Search by word…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Search corpus cards by word"
        />
        <button className="admin-btn" type="submit">
          Search
        </button>
      </form>
      {error && <p className="admin-error">{error}</p>}
      {loading && <p className="admin-muted">Loading…</p>}
      {!loading && !error && data && data.cards.length === 0 && (
        <p className="admin-muted">
          {q ? `No cards match “${q}”.` : "No cards in this pair yet."}
        </p>
      )}
      {!loading && !error && data && data.cards.length > 0 && (
        <div className="tile-grid">
          {data.cards.map((card) => {
            const inPack = packIds
              ? packIds.has(card.association_id)
              : (card.in_starter_pack ?? false);
            return (
              <AdminTile
                key={card.association_id}
                card={card}
                corner={
                  inPack ? (
                    <span className="in-pack-badge">in pack ✓</span>
                  ) : undefined
                }
              >
                <button
                  className="admin-btn primary"
                  onClick={() => void add(card.association_id)}
                  disabled={inPack || addingId !== null}
                >
                  {inPack
                    ? "In pack"
                    : addingId === card.association_id
                      ? "Adding…"
                      : "Add to pack"}
                </button>
              </AdminTile>
            );
          })}
        </div>
      )}
      {data && totalPages > 1 && (
        <div className="admin-pager">
          <button
            className="admin-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            ← Prev
          </button>
          <span>
            Page {data.page} of {totalPages} · {data.total} cards
          </span>
          <button
            className="admin-btn"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages || loading}
          >
            Next →
          </button>
        </div>
      )}
    </section>
  );
}

// ---- Pane 3: generate --------------------------------------------------------

function GeneratePane({
  pair,
  targetLanguage,
  packIds,
  onAdd,
}: {
  pair: string;
  targetLanguage: string | null;
  packIds: Set<number> | null;
  onAdd: (associationId: number) => Promise<boolean>;
}) {
  const [input, setInput] = useState("");
  const [card, setCard] = useState<AdminCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic token: bumping it cancels any in-flight image poll (re-roll,
  // pair switch unmount).
  const pollToken = useRef(0);

  useEffect(
    () => () => {
      pollToken.current++;
    },
    [],
  );

  // The generate response carries no image_url, so always fetch the card
  // detail once; keep polling every ~3 s while the illustration is 'pending'
  // ('none' = there won't be one, stop).
  async function pollImage(associationId: number) {
    const token = ++pollToken.current;
    setPolling(true);
    try {
      for (;;) {
        const fresh = await fetchAdminCard(associationId);
        if (pollToken.current !== token) return;
        setCard(fresh);
        if (fresh.image_status !== "pending") return;
        await new Promise((r) => setTimeout(r, IMAGE_POLL_MS));
        if (pollToken.current !== token) return;
      }
    } catch (err) {
      if (pollToken.current === token) setError(errorMessage(err));
    } finally {
      if (pollToken.current === token) setPolling(false);
    }
  }

  async function generate(word: string, avoidAssociationId?: number) {
    const trimmed = word.trim();
    if (!trimmed || busy) return;
    pollToken.current++;
    setPolling(false);
    setBusy(true);
    setError(null);
    try {
      const generated = await generateAdminCard(
        trimmed,
        pair,
        avoidAssociationId,
      );
      setCard(generated);
      setBusy(false);
      await pollImage(generated.association_id);
    } catch (err) {
      setBusy(false);
      setError(
        isAdminStatus(err, 404)
          ? `“${trimmed}” is not a known word in this pair.`
          : errorMessage(err),
      );
    }
  }

  const target = targetLanguage ? languageName(targetLanguage) : "the target language";
  const inPack =
    card !== null && (packIds?.has(card.association_id) ?? false);
  const imagePending = card?.image_status === "pending";

  return (
    <section className="admin-pane">
      <h2>Generate</h2>
      <p className="admin-pane-hint">
        Generate a fresh card for a word. Keyword quality matters: prefer
        sound-alike hooks that are native {target} words over loanword
        transliterations of the source word (for en → ru, трость and Кресло
        were keepers; СЛИП and Миньон were rejects) — re-roll until the hook is
        a real word. Also watch for compositions repeating the same scene
        across the pack.
      </p>
      <form
        className="admin-search"
        onSubmit={(e) => {
          e.preventDefault();
          void generate(input);
        }}
      >
        <input
          className="admin-input"
          type="text"
          placeholder="Word to generate…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Word to generate a card for"
        />
        <button
          className="admin-btn primary"
          type="submit"
          disabled={busy || !input.trim()}
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </form>
      {error && <p className="admin-error">{error}</p>}
      {card && (
        <div className="gen-result">
          <AdminTile card={card}>
            <button
              className="admin-btn primary"
              disabled={inPack || adding || imagePending || busy}
              onClick={async () => {
                setAdding(true);
                await onAdd(card.association_id);
                setAdding(false);
              }}
            >
              {inPack ? "In pack" : adding ? "Adding…" : "Add to pack"}
            </button>
            <button
              className="admin-btn"
              disabled={busy}
              onClick={() => void generate(card.word, card.association_id)}
            >
              Re-roll
            </button>
          </AdminTile>
          {card.explanation && (
            <p className="admin-muted gen-status" dir="auto">
              {card.explanation}
            </p>
          )}
          {polling && (
            <p className="admin-muted gen-status">
              Illustration rendering — checking every few seconds…
            </p>
          )}
          {card.image_status === "none" && (
            <p className="admin-muted gen-status">
              This card has no illustration.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Main: pair switcher + pane 1 (current pack) ----------------------------

export default function PackManager() {
  const [pairs, setPairs] = useState<PairSummary[] | null>(null);
  const [pair, setPair] = useState("");
  const [pack, setPack] = useState<AdminCard[] | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [packNotice, setPackNotice] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchPairsLive().then((ps) => {
      if (cancelled) return;
      setPairs(ps);
      if (ps.length > 0) setPair((cur) => cur || ps[0].pair);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshPack = useCallback(async () => {
    if (!pair) return;
    try {
      const data = await fetchStarterPack(pair);
      setPack(
        [...data.cards].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      );
      setPackError(null);
    } catch (err) {
      setPackError(errorMessage(err));
    }
  }, [pair]);

  useEffect(() => {
    setPack(null);
    setPackError(null);
    setPackNotice(null);
    void refreshPack();
  }, [refreshPack]);

  // Shared by the browse and generate panes. 409 (already a member) counts as
  // success — the pack resync below marks the tile either way.
  const addCard = useCallback(
    async (associationId: number): Promise<boolean> => {
      try {
        await addToStarterPack(pair, associationId);
      } catch (err) {
        if (!isAdminStatus(err, 409)) {
          setPackNotice(errorMessage(err));
          void refreshPack();
          return false;
        }
      }
      setPackNotice(null);
      await refreshPack();
      return true;
    },
    [pair, refreshPack],
  );

  async function move(index: number, delta: number) {
    if (!pack) return;
    const to = index + delta;
    if (to < 0 || to >= pack.length) return;
    const next = [...pack];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved);
    setPack(next); // optimistic; the PUT carries the full new order
    setPackBusy(true);
    try {
      await reorderStarterPack(
        pair,
        next.map((c) => c.association_id),
      );
      setPackNotice(null);
    } catch (err) {
      // 409 = the membership changed under us (stale view): reload and say so.
      setPackNotice(
        isAdminStatus(err, 409)
          ? "The pack changed elsewhere — reloaded the current version."
          : errorMessage(err),
      );
      await refreshPack();
    } finally {
      setPackBusy(false);
    }
  }

  async function remove(associationId: number) {
    setPackBusy(true);
    try {
      await removeFromStarterPack(pair, associationId);
      setPackNotice(null);
    } catch (err) {
      // 404 = already gone; the resync below settles it either way.
      if (!isAdminStatus(err, 404)) setPackNotice(errorMessage(err));
    } finally {
      await refreshPack();
      setPackBusy(false);
    }
  }

  const selected = pairs?.find((p) => p.pair === pair) ?? null;
  const packIds = pack ? new Set(pack.map((c) => c.association_id)) : null;

  return (
    <>
      <h1>Starter packs</h1>
      <p className="admin-intro">
        Pick, order, and generate the cards each pair ships with. Aim for
        about {PACK_TARGET} cards — the target is advisory, not enforced.
      </p>

      <div className="pack-toolbar">
        <label className="pack-toolbar-label" htmlFor="pair-select">
          Pair
        </label>
        <select
          id="pair-select"
          className="admin-input"
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          disabled={!pairs || pairs.length === 0}
        >
          {(pairs ?? []).map((p) => (
            <option key={p.pair} value={p.pair}>
              {languageFlag(p.source_language) ?? ""}{" "}
              {languageName(p.source_language)} →{" "}
              {languageFlag(p.target_language) ?? ""}{" "}
              {languageName(p.target_language)}
            </option>
          ))}
        </select>
        {pack && (
          <span
            className={`pack-badge${pack.length >= PACK_TARGET ? " full" : ""}`}
          >
            {pack.length} / {PACK_TARGET} target
          </span>
        )}
      </div>
      {pairs && pairs.length === 0 && (
        <p className="admin-error">
          Could not load the pair list — is the server reachable?
        </p>
      )}

      <section className="admin-pane">
        <h2>Current pack</h2>
        <p className="admin-pane-hint">
          The order here is the order new users see the deck in. Move cards
          with the arrows; every move saves immediately.
        </p>
        {packNotice && <p className="admin-notice">{packNotice}</p>}
        {packError ? (
          <p className="admin-error">{packError}</p>
        ) : pack === null ? (
          <p className="admin-muted">Loading…</p>
        ) : pack.length === 0 ? (
          <p className="admin-muted">
            No cards in this pack yet — add some below.
          </p>
        ) : (
          <div className="tile-grid">
            {pack.map((card, i) => (
              <AdminTile
                key={card.association_id}
                card={card}
                corner={<span className="card-sub">#{i + 1}</span>}
              >
                <button
                  className="admin-btn"
                  onClick={() => void move(i, -1)}
                  disabled={packBusy || i === 0}
                  aria-label={`Move ${card.word} earlier`}
                >
                  ↑
                </button>
                <button
                  className="admin-btn"
                  onClick={() => void move(i, 1)}
                  disabled={packBusy || i === pack.length - 1}
                  aria-label={`Move ${card.word} later`}
                >
                  ↓
                </button>
                <button
                  className="admin-btn danger"
                  onClick={() => void remove(card.association_id)}
                  disabled={packBusy}
                  aria-label={`Remove ${card.word} from the pack`}
                >
                  Remove
                </button>
              </AdminTile>
            ))}
          </div>
        )}
      </section>

      {pair && (
        <BrowsePane
          key={`browse-${pair}`}
          pair={pair}
          packIds={packIds}
          onAdd={addCard}
        />
      )}
      {pair && (
        <GeneratePane
          key={`gen-${pair}`}
          pair={pair}
          targetLanguage={selected?.target_language ?? null}
          packIds={packIds}
          onAdd={addCard}
        />
      )}
    </>
  );
}
