"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { Track } from "@/lib/music";

export type SoundCloudControls = {
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  next: () => void;
  previous: () => void;
};

type WidgetSound = {
  title?: string;
  playable?: boolean;
  duration?: number;
  artwork_url?: string | null;
  permalink_url?: string;
  user?: { username?: string };
};

type Widget = {
  bind: (event: string, callback: (data?: { currentPosition?: number }) => void) => void;
  unbind: (event: string) => void;
  play: () => void;
  pause: () => void;
  seekTo: (milliseconds: number) => void;
  setVolume: (volume: number) => void;
  next: () => void;
  prev: () => void;
  getDuration: (callback: (duration: number) => void) => void;
  getCurrentSound: (callback: (sound: WidgetSound | null) => void) => void;
};

type WidgetFactory = ((element: HTMLIFrameElement) => Widget) & {
  Events: Record<"READY" | "PLAY" | "PAUSE" | "PLAY_PROGRESS" | "FINISH" | "ERROR", string>;
};

declare global {
  interface Window { SC?: { Widget: WidgetFactory } }
}

type Props = {
  track: Track;
  volume: number;
  expanded: boolean;
  onCollapse: () => void;
  onPlayingChange: (playing: boolean) => void;
  onProgress: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onSound: (sound: WidgetSound) => void;
  onFinish: () => void;
  onError: () => void;
};

let apiPromise: Promise<void> | null = null;
function loadWidgetApi(): Promise<void> {
  if (window.SC?.Widget) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () => window.SC?.Widget ? resolve() : reject(new Error("Widget API unavailable"));
    script.onerror = () => { script.remove(); reject(new Error("Widget API unavailable")); };
    document.head.appendChild(script);
  }).catch((error) => { apiPromise = null; throw error; });
  return apiPromise;
}

function getEmbedUrl(track: Track): string {
  try {
    const url = new URL(track.soundcloudEmbedUrl || track.audioUrl);
    if (url.protocol !== "https:" || url.hostname !== "w.soundcloud.com" || url.pathname !== "/player/") return "";
    url.searchParams.set("auto_play", "false");
    url.searchParams.set("visual", "false");
    url.searchParams.set("show_comments", "false");
    return url.toString();
  } catch {
    return "";
  }
}

const SoundCloudPlayer = forwardRef<SoundCloudControls, Props>(function SoundCloudPlayer(props, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<Widget | null>(null);
  const readyRef = useRef(false);
  const shouldPlay = useRef(true);
  const latest = useRef(props);
  const [apiReady, setApiReady] = useState(false);
  const embedUrl = getEmbedUrl(props.track);

  useEffect(() => { latest.current = props; });

  useImperativeHandle(ref, () => ({
    play: () => { shouldPlay.current = true; if (readyRef.current) widgetRef.current?.play(); },
    pause: () => { shouldPlay.current = false; if (readyRef.current) widgetRef.current?.pause(); },
    seekTo: (seconds) => { if (readyRef.current) widgetRef.current?.seekTo(Math.max(0, seconds) * 1000); },
    next: () => { if (readyRef.current) widgetRef.current?.next(); },
    previous: () => { if (readyRef.current) widgetRef.current?.prev(); },
  }), []);

  useEffect(() => {
    let cancelled = false;
    loadWidgetApi().then(() => { if (!cancelled) setApiReady(true); }).catch(() => { if (!cancelled) latest.current.onError(); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!apiReady || !iframeRef.current || !window.SC?.Widget || !embedUrl) return;
    const factory = window.SC.Widget;
    const frame = iframeRef.current;
    const widget = factory(frame);
    const events = factory.Events;
    let disposed = false;
    let reportedUnavailable = false;
    widgetRef.current = widget;
    readyRef.current = false;
    shouldPlay.current = true;

    const readCurrent = () => {
      widget.getDuration((milliseconds) => {
        if (!disposed && Number.isFinite(milliseconds)) latest.current.onDuration(milliseconds / 1000);
      });
      widget.getCurrentSound((sound) => { if (!disposed && sound) latest.current.onSound(sound); });
    };

    widget.bind(events.READY, () => {
      if (disposed) return;
      readyRef.current = true;
      widget.setVolume(Math.round(latest.current.volume * 100));
      readCurrent();
      if (shouldPlay.current) widget.play();
    });
    widget.bind(events.PLAY, () => {
      if (disposed) return;
      latest.current.onPlayingChange(true);
      readCurrent();
    });
    widget.bind(events.PAUSE, () => { if (!disposed) latest.current.onPlayingChange(false); });
    widget.bind(events.PLAY_PROGRESS, (data) => {
      if (!disposed && typeof data?.currentPosition === "number") latest.current.onProgress(data.currentPosition / 1000);
    });
    widget.bind(events.FINISH, () => { if (!disposed) latest.current.onFinish(); });
    widget.bind(events.ERROR, () => { if (!disposed) latest.current.onError(); });

    return () => {
      disposed = true;
      readyRef.current = false;
      if (frame.isConnected && frame.contentWindow) {
        try {
          for (const event of [events.READY, events.PLAY, events.PAUSE, events.PLAY_PROGRESS, events.FINISH, events.ERROR]) widget.unbind(event);
          widget.pause();
        } catch {
          // SoundCloud can remove its frame before React finishes cleaning up.
        }
      }
      if (widgetRef.current === widget) widgetRef.current = null;
    };
  }, [apiReady, embedUrl, props.track.id]);

  useEffect(() => {
    if (readyRef.current) widgetRef.current?.setVolume(Math.round(props.volume * 100));
  }, [props.volume]);

  return (
    <div className={`soundcloud-dock ${props.expanded ? "is-open" : "is-collapsed"}`} aria-hidden={!props.expanded}>
      <div className="soundcloud-dock-header"><span><strong>SoundCloud</strong><small>Официальный плеер</small></span><div>{props.track.soundcloudUrl && <a href={props.track.soundcloudUrl} target="_blank" rel="noreferrer" title="Открыть на SoundCloud" aria-label="Открыть на SoundCloud"><ExternalLink size={16} /></a>}<button onClick={props.onCollapse} type="button" aria-label="Свернуть плеер SoundCloud" title="Свернуть"><ChevronDown size={18} /></button></div></div>
      {apiReady && embedUrl && <iframe key={props.track.id} ref={iframeRef} className="soundcloud-dock-iframe" title="Плеер SoundCloud" src={embedUrl} width="100%" height="166" scrolling="no" frameBorder="0" allow="autoplay; encrypted-media" tabIndex={props.expanded ? 0 : -1} />}
    </div>
  );
});

export default SoundCloudPlayer;
