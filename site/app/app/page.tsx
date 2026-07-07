import type { Metadata } from "next";
import Link from "next/link";
import { APP_STORE_URL } from "@/components/chrome";
import "../home.css";

// The marketing page (former home page content, moved unchanged when the home
// page became the deck feed — VocabCards#194). The browse section it used to
// carry is superseded by the deck's sidebar pair filter.

export const metadata: Metadata = {
  title: "Absurdissimo — Vocabulary that actually sticks",
  description:
    "Look up words in 20 languages and get vivid, absurd mnemonic stories that make vocabulary impossible to forget.",
  // The home page stays the one indexable page of the site.
  robots: { index: false, follow: true },
};

export default function AppPage() {
  return (
    <div className="home">
      <nav>
        <Link className="nav-brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Absurdissimo icon" />
          Absurdissimo
        </Link>
        <Link className="nav-link" href="/feedback">
          Feedback
        </Link>
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
          <a className="appstore-btn" href={APP_STORE_URL} aria-label="Get early access on TestFlight">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04l-.07.28zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
            </svg>
            <span className="appstore-btn-main">Get early access</span>
          </a>
          <p className="beta-note">
            🚧 Absurdissimo is still in beta. Install Apple&rsquo;s{" "}
            <a href={APP_STORE_URL}>TestFlight</a> app first, then tap above to
            join and be one of the very first to try it.{" "}
            <strong>The first App Store release is coming soon.</strong>
          </p>
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

      <footer>
        <p>Absurdissimo &copy; 2026 Ivan Balashov</p>
        <div className="footer-links">
          <Link href="/feedback">Feedback</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
