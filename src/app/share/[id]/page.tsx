import { db } from "@/db";
import { playlistShares } from "@/db/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import CopyLinksButton from "@/components/copy-links-button";
import { buildShareQr, shareLinksText } from "@/lib/share";
import { formatTime } from "@/lib/music";

export const dynamic = "force-dynamic";

async function resolveOrigin(): Promise<string> {
  const store = await headers();
  const host = store.get("host") || "localhost:3000";
  const proto = store.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function SharedPlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{4,40}$/.test(id)) notFound();

  const [share] = await db.select().from(playlistShares).where(eq(playlistShares.id, id));
  if (!share) notFound();

  const origin = await resolveOrigin();
  const linksText = shareLinksText(share.tracks);
  const qr = await buildShareQr(share.tracks, `${origin}/share/${share.id}`);
  const withLinks = share.tracks.filter((track) => Boolean(track.url));

  return (
    <main className="share-page">
      <div className="share-page-card">
        <Link href="/" className="share-page-brand">
          <img src="/images/wave-icon.svg" alt="" />
          <span>volna.</span>
        </Link>

        <div className="share-page-head">
          <div>
            <span className="small-kicker">ПОДЕЛИЛИСЬ ПЛЕЙЛИСТОМ</span>
            <h1>{share.name}<span>✳</span></h1>
            <p>{withLinks.length} {withLinks.length === 1 ? "трек" : "треков"} со ссылками · можно открыть у любого пользователя</p>
          </div>
          <div className="share-page-qr">
            <img src={qr.dataUrl} alt="QR-код плейлиста" width={220} height={220} />
            <small>{qr.mode === "links" ? "В QR-коде — все ссылки на треки" : "В QR-коде — ссылка на этот список треков"}</small>
          </div>
        </div>

        <ol className="share-page-tracks">
          {share.tracks.map((track, index) => (
            <li key={`${track.title}-${index}`}>
              <span className="share-page-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="share-page-copy">
                <strong>{track.title}</strong>
                <small>{track.artist}{track.duration ? ` · ${formatTime(track.duration)}` : ""}</small>
              </span>
              {track.url ? (
                <a href={track.url} target="_blank" rel="noreferrer">Слушать ↗</a>
              ) : (
                <span className="share-page-missing">локальный файл</span>
              )}
            </li>
          ))}
        </ol>

        <div className="share-page-actions">
          <CopyLinksButton text={linksText || `${origin}/share/${share.id}`} />
          <a className="share-page-link" href="/">Открыть volna ↗</a>
        </div>
        <p className="share-page-note">
          Ссылки ведут на страницы треков или на аудиофайлы. Локальные файлы владельца остаются только на его устройстве.
        </p>
      </div>
    </main>
  );
}
