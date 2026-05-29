"use client";

type Props = {
  text: string;
  url: string;
};

export default function ShareButton({ text, url }: Props) {
  const href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

  return (
    <a
      className="share-x"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Share this on X"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      <span>Share on X</span>
    </a>
  );
}
