export default function Loading() {
  return (
    <main
      className="loading-page"
      aria-label="Loading research publications"
      aria-busy="true"
    >
      <h1>Research map</h1>
      <p>Loading publications and study locations…</p>
      <div className="loading-skeleton" />
      <div className="loading-skeleton short" />
    </main>
  );
}
