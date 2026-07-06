"use client";

import { useEffect, useState } from "react";

// Web analog of the app's PronunciationSpeaker (AVSpeechSynthesizer): the
// browser's built-in SpeechSynthesis API — on-device voices, no server audio.
// Rendered only after mount so SSG markup never includes a button that a
// speech-less browser can't honor.
export default function PronounceButton({
  word,
  lang,
}: {
  word: string;
  lang: string;
}) {
  const [available, setAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setAvailable("speechSynthesis" in window);
    return () => window.speechSynthesis?.cancel();
  }, []);

  if (!available) return null;

  const speak = () => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = lang;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.speak(utterance);
  };

  return (
    <button
      type="button"
      className={`pronounce-btn${speaking ? " speaking" : ""}`}
      onClick={speak}
      aria-label={`Play pronunciation of ${word}`}
      title="Play pronunciation"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}
