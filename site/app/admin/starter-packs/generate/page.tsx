"use client";

// Starter packs · Generate sub-page. Remounts the pane on pair change
// (key={pair}) so the in-flight card and image poll reset with the pair;
// shared pair/pack state comes from the section layout's provider.

import GeneratePane from "../GeneratePane";
import { useStarterPack } from "../StarterPackContext";

export default function StarterPacksGeneratePage() {
  const { pair } = useStarterPack();
  return pair ? <GeneratePane key={pair} /> : null;
}
