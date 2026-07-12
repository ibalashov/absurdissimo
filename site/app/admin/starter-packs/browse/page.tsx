"use client";

// Starter packs · Browse & select sub-page. Remounts the pane on pair change
// (key={pair}) so its search state resets with the pair; shared pair/pack
// state comes from the section layout's provider.

import BrowsePane from "../BrowsePane";
import { useStarterPack } from "../StarterPackContext";

export default function StarterPacksBrowsePage() {
  const { pair } = useStarterPack();
  return pair ? <BrowsePane key={pair} /> : null;
}
