"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="loading-page">
      <h1>We couldn’t load the explorer.</h1>
      <p>Please try again in a moment.</p>
      <button onClick={reset} className="primary-button">
        Try again
      </button>
    </main>
  );
}
