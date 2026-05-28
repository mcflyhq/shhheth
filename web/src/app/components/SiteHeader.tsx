const X_HANDLE = "https://x.com/shhheth";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand-lockup" href="/" aria-label="shhheth home">
        <span aria-hidden="true" className="brand-symbol">🤫</span>
        <span className="brand-wordmark">shhheth</span>
      </a>
      <nav className="site-header-right" aria-label="primary">
        <a
          className="nav-x-link"
          href={X_HANDLE}
          target="_blank"
          rel="noreferrer"
          aria-label="shhheth on X"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2H21l-6.52 7.45L22 22h-6.79l-4.74-6.2L4.8 22H2l7.06-8.07L2 2h6.91l4.28 5.66L18.244 2Zm-2.38 18.4h1.77L7.27 3.5H5.4l10.46 16.9Z" />
          </svg>
        </a>
      </nav>
    </header>
  );
}
