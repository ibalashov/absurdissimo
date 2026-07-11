import Link from "next/link";

// The app is not on the App Store yet — it ships as a TestFlight beta while the
// first release is prepared. Every "get the app" link across the site points at
// this invite; swap it for the real App Store URL at launch. The hero button on
// the standalone marketing page (../../index.html) and the /app page must be
// updated together with this constant.
export const APP_STORE_URL = "https://testflight.apple.com/join/ateXeB2Z";

function AppleLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.18 1.27-2.16 3.8.03 3.02 2.65 4.03 2.68 4.04l-.07.28zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

export function AppStoreButton() {
  return (
    <a
      className="appstore-btn"
      href={APP_STORE_URL}
      aria-label="Get early access on TestFlight"
    >
      <AppleLogo />
      <span className="appstore-btn-main">Get early access</span>
    </a>
  );
}

export function SiteNav() {
  return (
    <nav className="cards-nav">
      {/* prefetch={false}: "/" is cookie-varied by the middleware's sticky
          rewrite, so prefetching it pins the prefetch-time cookie's deck in
          the session-wide router cache and stale-serves it after the cookie
          changes (see the deck topbar's brand link in DeckClient). */}
      <Link className="nav-brand" href="/" prefetch={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="Absurdissimo icon" />
        Absurdissimo
      </Link>
      <a className="nav-cta" href={APP_STORE_URL}>
        Get the app
      </a>
    </nav>
  );
}

export function GetAppSection() {
  return (
    <section className="get-app">
      <h2>
        Vocabulary that <span>actually sticks</span>
      </h2>
      <p>
        Look up words in 20 languages and get vivid, absurd mnemonic stories
        that make vocabulary impossible to forget.
      </p>
      <AppStoreButton />
      <p className="beta-note">
        🚧 Absurdissimo is still in beta. Install Apple&rsquo;s{" "}
        <a href="https://testflight.apple.com/join/ateXeB2Z">TestFlight</a> app
        first, then tap above to join and be one of the very first to try it.{" "}
        <strong>The first App Store release is coming soon.</strong>
      </p>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="cards-footer">
      <p>Absurdissimo &copy; 2026 Ivan Balashov</p>
      <div className="footer-links">
        <Link href="/feedback">Feedback</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </div>
    </footer>
  );
}
