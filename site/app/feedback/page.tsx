import type { Metadata } from "next";
import { SiteFooter, SiteNav } from "@/components/chrome";
import { FeedbackForm } from "@/components/FeedbackForm";
import "../cards.css";
import "./feedback.css";

export const metadata: Metadata = {
  title: "Feedback — Absurdissimo",
  description: "Send feedback, report a bug, or request a language pair.",
  robots: { index: false, follow: true },
};

export default function FeedbackPage() {
  return (
    <>
      <SiteNav />
      <main className="feedback-page">
        <h1>Send us feedback</h1>
        <p className="feedback-intro">
          Absurdissimo is in beta — your notes genuinely shape what ships next.
          Report a bug, tell us which card made you laugh, or ask for a language
          pair. We read every message.
        </p>
        <FeedbackForm />
      </main>
      <SiteFooter />
    </>
  );
}
