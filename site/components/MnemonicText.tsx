import { Fragment, type ReactNode } from "react";

// Highlights a mnemonic's sound-alike keywords, mirroring the iOS app
// (VocabCards/MarkdownText.swift). The LLM marks sound-alikes inconsistently:
// ALL-CAPS inside the sentence, **markdown bold**, *markdown italic*, or only
// via the association's `keyword` field ("Канат + то" for split-strategy
// cards). Like iOS we highlight the union — bold spans, caps runs, and
// whole-word matches of each keyword token — and strip the emphasis
// asterisks so they never render literally. Highlighted spans render
// uppercase in the accent colour so they pop against the rest.
//
const TOKEN = /\*\*(.+?)\*\*|\*([^*\n]+?)\*/gu;

// Caps runs are matched with \p{Lu}{2,} rather than word boundaries because \b
// is ASCII-only in JS and these mnemonics are mostly Cyrillic; a run of 2+
// consecutive uppercase letters is exactly the LLM's emphasis convention.
const CAPS_RUN = /\p{Lu}{2,}/gu;

interface Segment {
  text: string;
  keyword: boolean;
}

// Whole-word regex for one keyword token, with Unicode-aware boundaries
// (lookarounds instead of the ASCII-only \b). Single-letter tokens (e.g. "V"
// in "CHIA + V") match case-sensitively so an article like "a" can never
// light up; longer tokens match case-insensitively.
function tokenPattern(token: string): RegExp {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = token.length >= 2 ? "giu" : "gu";
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags);
}

// Splits a plain-text piece on keyword-token matches.
function splitOnTokens(text: string, patterns: RegExp[]): Segment[] {
  let segs: Segment[] = [{ text, keyword: false }];
  for (const pattern of patterns) {
    segs = segs.flatMap((seg) => {
      if (seg.keyword) return [seg];
      const out: Segment[] = [];
      let last = 0;
      for (const match of seg.text.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > last) out.push({ text: seg.text.slice(last, index), keyword: false });
        out.push({ text: match[0], keyword: true });
        last = index + match[0].length;
      }
      if (last < seg.text.length) out.push({ text: seg.text.slice(last), keyword: false });
      return out;
    });
  }
  return segs;
}

function segments(text: string, keyword?: string | null): Segment[] {
  const patterns = [
    CAPS_RUN,
    ...(keyword ?? "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map(tokenPattern),
  ];

  const segs: Segment[] = [];
  const pushPlain = (piece: string) => segs.push(...splitOnTokens(piece, patterns));
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) pushPlain(text.slice(last, index));
    if (match[2] !== undefined) {
      // *italic*: strip the asterisks; highlight only if a keyword token (or
      // caps run) says so — the LLM also italicises the card's meaning, which
      // must stay plain.
      pushPlain(match[2]);
    } else {
      segs.push({ text: match[1], keyword: true });
    }
    last = index + match[0].length;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return segs;
}

// Returns inline nodes — the caller supplies the surrounding <p> (and its
// class / dir), so this drops into the existing card and word-page markup.
export default function MnemonicText({
  text,
  keyword,
}: {
  text: string;
  keyword?: string | null;
}): ReactNode {
  return (
    <>
      {segments(text, keyword).map((seg, i) =>
        seg.keyword ? (
          <span className="kw" key={i}>
            {seg.text.toUpperCase()}
          </span>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
