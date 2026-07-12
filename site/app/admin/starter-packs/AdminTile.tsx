"use client";

// One association rendered with the site's card-tile look (globals.css .card
// classes + MnemonicText/CardImage), plus an actions row instead of a link.
// Shared by all three starter-pack sub-pages (current pack, browse, generate).

import { type DragEventHandler, type ReactNode } from "react";
import CardImage from "@/components/CardImage";
import MnemonicText from "@/components/MnemonicText";
import { adminImageUrl, type AdminCard } from "@/lib/admin";

// Optional drag wiring — used by the current-pack sub-page to reorder tiles
// via native HTML5 drag-and-drop; the other panes leave these unset.
export interface AdminTileDrag {
  className?: string;
  draggable?: boolean;
  onDragStart?: DragEventHandler;
  onDragOver?: DragEventHandler;
  onDragLeave?: DragEventHandler;
  onDrop?: DragEventHandler;
  onDragEnd?: DragEventHandler;
}

export default function AdminTile({
  card,
  corner,
  children,
  drag,
}: {
  card: AdminCard;
  corner?: ReactNode;
  children?: ReactNode;
  drag?: AdminTileDrag;
}) {
  const img = card.image_url ? adminImageUrl(card.image_url) : null;
  return (
    <div
      className={`card admin-tile${drag?.className ? ` ${drag.className}` : ""}`}
      draggable={drag?.draggable}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDragLeave={drag?.onDragLeave}
      onDrop={drag?.onDrop}
      onDragEnd={drag?.onDragEnd}
    >
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
