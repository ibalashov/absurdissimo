import type { Metadata } from "next";
import Link from "next/link";
import { getPairs, languageName } from "@/lib/api";
import "./home.css";

// Must match REVALIDATE_SECONDS in lib/api.ts (Next requires a literal here).
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Absurdissimo — Vocabulary that actually sticks",
  description:
    "Look up words in 20 languages and get vivid, absurd mnemonic stories that make vocabulary impossible to forget.",
};

export default async function Home() {
  const pairs = await getPairs();
  return (
    <div className="home">
      <nav>
        <a className="nav-brand" href="#">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Absurdissimo icon" />
          Absurdissimo
        </a>
        <a className="nav-link" href="mailto:ibalashov+absurdissimo@gmail.com">
          Support
        </a>
      </nav>

      <section className="hero">
        <div className="hero-text">
          <p className="hero-eyebrow">✨ iOS App</p>
          <h1>
            Vocabulary that <span>actually sticks</span>
          </h1>
          <p className="hero-sub">
            Look up words in 20 languages and get vivid, absurd mnemonic
            stories that make vocabulary impossible to forget.
          </p>
          <a className="appstore-btn" href="#" aria-label="Download on the App Store">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04l-.07.28zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <span>
              <span className="appstore-btn-sub">Download on the</span>
              <span className="appstore-btn-main">App Store</span>
            </span>
          </a>
        </div>

        <div className="hero-screenshots">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screenshot1.png" alt="Absurdissimo word card for specchio" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/screenshot2.png" alt="Absurdissimo word card for sdegno" />
        </div>
      </section>

      <section className="features">
        <h2>How it works</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h3>Look up any word</h3>
            <p>
              Type a word in any of 20 supported languages and get
              pronunciation, part of speech, and definition instantly.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <h3>Get a mnemonic story</h3>
            <p>
              An AI generates a vivid, absurd association connecting the
              foreign word to something familiar — the weirder, the better.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎨</div>
            <h3>See it illustrated</h3>
            <p>
              Every mnemonic comes with an AI-generated illustration that
              brings the story to life.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎚️</div>
            <h3>Dial the absurdity</h3>
            <p>
              From sensible to completely unhinged — choose how wild you want
              the associations to be.
            </p>
          </div>
        </div>
      </section>

      {pairs.length > 0 && (
        <section className="browse">
          <h2>Browse the cards</h2>
          <p className="browse-sub">
            Explore published mnemonic cards by language pair.
          </p>
          <ul className="browse-list">
            {pairs.map((p) => (
              <li key={p.pair}>
                <Link className="browse-link" href={`/${p.pair}`}>
                  <span className="browse-pair">
                    {languageName(p.source_language)} →{" "}
                    {languageName(p.target_language)}
                  </span>
                  <span className="browse-count">
                    {p.word_count} {p.word_count === 1 ? "word" : "words"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer>
        <p>Absurdissimo &copy; 2026 Ivan Balashov</p>
        <div className="footer-links">
          <a href="mailto:ibalashov@gmail.com">Support</a>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
