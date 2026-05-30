import { useState, useCallback, useEffect, useRef, memo } from "react";
import type { QueueItem } from "../api/client";
import { useI18n } from "../i18n/context";
import { usePlayerStore } from "../stores/playerStore";

interface Props {
  items: QueueItem[];
  onItemClick?: (item: QueueItem) => void;
}

interface ContextMenu {
  x: number;
  y: number;
  item: QueueItem;
}

export default memo(function QueueList({ items, onItemClick }: Props) {
  const { t } = useI18n();
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { toggleFavorite, favoriteIds, playNext, removeFromQueue, nowPlaying } = usePlayerStore();

  const handleContextMenu = useCallback((e: React.MouseEvent, item: QueueItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [closeContextMenu]);

  const handlePlayNext = useCallback((item: QueueItem) => {
    playNext(item);
    closeContextMenu();
  }, [playNext, closeContextMenu]);

  const handleToggleFavorite = useCallback((item: QueueItem) => {
    if (item.songId) {
      toggleFavorite(item.songId, item.title, item.artist, item.coverUrl);
    }
    closeContextMenu();
  }, [toggleFavorite, closeContextMenu]);

  if (items.length === 0) {
    return (
      <div className="queue-empty">
        <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.3 }}>&#9835;</div>
        <div>{t("emptyQueue")}</div>
      </div>
    );
  }

  return (
    <>
      <ul className="queue-list">
        {items.map((item, idx) => {
          const isCurrentPlaying = nowPlaying?.id === item.id;
          return (
            <li
              key={item.id}
              className={`queue-item ${item.status} ${isCurrentPlaying ? "current" : ""}`}
              style={{ animationDelay: `${Math.min(idx * 0.05, 0.5)}s` }}
              onClick={() => onItemClick?.(item)}
              onContextMenu={(e) => handleContextMenu(e, item)}
            >
              <span className="queue-index">{idx + 1}</span>
              <CoverImage url={item.coverUrl} />
              <div className="queue-info">
                <span className="queue-title">
                  {item.type === "tts" ? item.text : item.title ?? "Unknown Track"}
                </span>
                {item.artist && <span className="queue-artist">{item.artist}</span>}
              </div>
              <span className="queue-status">
                {isCurrentPlaying && item.status === "playing" && (
                  <span className="eq-bars">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="eq-bar"
                        style={{ "--delay": `${i * 0.15}s` } as React.CSSProperties}
                      />
                    ))}
                  </span>
                )}
              </span>
              <button
                className="queue-play-next-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePlayNext(item);
                }}
                title={t("playNext")}
              >
                &#9654;&#10095;
              </button>
              <button
                className="queue-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromQueue(item.id);
                }}
                title={t("deletePlaylist")}
              >
                &#10005;
              </button>
            </li>
          );
        })}
      </ul>

      {contextMenu && (
        <div
          ref={menuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="context-menu-item"
            onClick={() => handlePlayNext(contextMenu.item)}
          >
            <span className="context-menu-icon">&#9654;</span>
            <span>{t("playNext")}</span>
          </button>
          {contextMenu.item.songId && (
            <button
              className="context-menu-item"
              onClick={() => handleToggleFavorite(contextMenu.item)}
            >
              <span className="context-menu-icon">
                {favoriteIds.includes(contextMenu.item.songId) ? "&#10084;" : "&#9825;"}
              </span>
              <span>{favoriteIds.includes(contextMenu.item.songId) ? t("removeFavorite") : t("addFavorite")}</span>
            </button>
          )}
        </div>
      )}
    </>
  );
})

function CoverImage({ url }: { url?: string }) {
  const [error, setError] = useState(false);

  if (!url || error) {
    return (
      <div className="queue-cover">
        <div className="queue-cover-fallback">
          <span>&#9835;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="queue-cover">
      <img src={url} alt="" loading="lazy" onError={() => setError(true)} />
    </div>
  );
}
