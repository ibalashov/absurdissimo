import type { Metadata } from "next";
import Link from "next/link";
import "./privacy.css";

export const metadata: Metadata = {
  title: "Privacy Policy — Absurdissimo",
};

export default function Privacy() {
  return (
    <div className="privacy">
      <div className="wrap">
        <Link className="back" href="/">
          ← Back
        </Link>
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: July 2026</p>

        <p>
          Absurdissimo (&quot;the app&quot;) is operated by Ivan Balashov. This
          policy explains what data the app collects and how it is used.
        </p>

        <h2>What we collect</h2>
        <p>The app collects the following data to function:</p>
        <ul>
          <li>
            <strong>Words you look up.</strong> Sent to our server to generate
            associations and illustrations. Words are cached to improve
            performance.
          </li>
          <li>
            <strong>Anonymous device identifier.</strong> A randomly generated
            ID stored on your device, used only to enforce per-device usage
            quotas. It is not linked to your Apple ID, name, or any personal
            information.
          </li>
          <li>
            <strong>Usage events.</strong> Anonymous analytics (via PostHog)
            including which features you use, lookup counts, and app
            performance metrics. No personal data is included.
          </li>
        </ul>

        <h2>Google sign-in on the community pages</h2>
        <p>
          Posting an association or a comment in the community view on this
          website requires signing in with Google. When you sign in, our
          server receives and stores your Google account identifier and email
          address, used only to recognize your account. The display handle
          you choose is shown publicly next to your contributions, and your
          contributions are collected on a public profile page under that
          handle. Voting stays anonymous: votes remain keyed to the random
          device identifier, not to your account. Browsing and voting never
          require an account.
        </p>

        <h2>What we do not collect</h2>
        <ul>
          <li>Your name or Apple ID</li>
          <li>
            Your email — unless you sign in with Google on the website&apos;s
            community pages (see above)
          </li>
          <li>Your location</li>
          <li>Your contacts or photos</li>
          <li>Any data from other apps</li>
        </ul>

        <h2>Third-party services</h2>
        <p>The app uses the following third-party services to generate content:</p>
        <ul>
          <li>
            <strong>Google Gemini</strong> — generates mnemonic associations
          </li>
          <li>
            <strong>OpenAI</strong> — generates word definitions and
            illustrations
          </li>
          <li>
            <strong>PostHog</strong> — anonymous usage analytics
          </li>
        </ul>
        <p>
          Words you look up are sent to these services solely to generate the
          content shown in the app.
        </p>

        <h2>Data retention</h2>
        <p>
          Looked-up words and their generated associations are cached on our
          server to avoid redundant AI calls. This cache may be retained
          indefinitely. No personal data is retained.
        </p>

        <h2>Your rights</h2>
        <p>
          The app itself collects no personal data, so there is nothing to
          access, correct, or delete. If you signed in with Google on the
          website and want your account data removed, or have any other
          questions, reach us through our{" "}
          <Link href="/feedback">feedback page</Link>.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy. Continued use of the app after changes
          constitutes acceptance of the new policy.
        </p>

        <h2>Contact</h2>
        <p>
          <Link href="/feedback">Send us feedback</Link>
        </p>
      </div>
    </div>
  );
}
