import { Fragment, type ReactNode } from "react";

// Inline-basics markup for user-generated text (VocabCards #336): **bold**,
// *italic*, and `code` in comments and explanations. Deliberately no links
// (the server's moderation gate rejects URLs) and no block elements.
// Mnemonics don't use this — they keep MnemonicText, where the same asterisk
// syntax carries keyword-highlight semantics inherited from the LLM corpus.
//
// Alternation order matters: ** must match before * so bold isn't eaten as
// two italics; spans never nest (first match wins, scan continues after it).
const TOKEN = /\*\*(.+?)\*\*|\*([^*\n]+?)\*|`([^`\n]+?)`/gu;

export default function InlineMarkup({ text }: { text: string }): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(<Fragment key={last}>{text.slice(last, index)}</Fragment>);
    if (match[1] !== undefined) {
      nodes.push(<strong key={index}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={index}>{match[2]}</em>);
    } else {
      nodes.push(
        <code className="md-code" key={index}>
          {match[3]}
        </code>,
      );
    }
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(<Fragment key={last}>{text.slice(last)}</Fragment>);
  return <>{nodes}</>;
}
