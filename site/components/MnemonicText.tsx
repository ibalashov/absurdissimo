import { Fragment, type ReactNode } from "react";

// Highlights a mnemonic's sound-alike keywords, mirroring the iOS app
// (VocabCards/MarkdownText.swift): the LLM writes the sound-alikes in ALL-CAPS
// inside the sentence (and, occasionally, in **markdown bold**). Both get the
// accent colour and render uppercase so they pop against the rest.
//
// Caps runs are matched with \p{Lu}{2,} rather than word boundaries because \b
// is ASCII-only in JS and these mnemonics are mostly Cyrillic; a run of 2+
// consecutive uppercase letters is exactly the LLM's emphasis convention.
const TOKEN = /\*\*(.+?)\*\*|(\p{Lu}{2,})/gu;

interface Segment {
  text: string;
  keyword: boolean;
}

function segments(text: string): Segment[] {
  const segs: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) segs.push({ text: text.slice(last, index), keyword: false });
    segs.push({ text: (match[1] ?? match[2]).toUpperCase(), keyword: true });
    last = index + match[0].length;
  }
  if (last < text.length) segs.push({ text: text.slice(last), keyword: false });
  return segs;
}

// Returns inline nodes — the caller supplies the surrounding <p> (and its
// class / dir), so this drops into the existing card and word-page markup.
export default function MnemonicText({ text }: { text: string }): ReactNode {
  return (
    <>
      {segments(text).map((seg, i) =>
        seg.keyword ? (
          <span className="kw" key={i}>
            {seg.text}
          </span>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  );
}
