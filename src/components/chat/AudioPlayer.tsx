'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Music, Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  url?: string;
  fileName: string;
  fileSizeBytes?: number;
  onDownload?: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  url,
  fileName,
  fileSizeBytes,
  onDownload,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [url]);

  const togglePlay = () => {
    if (!audioRef.current || !url) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-black/25 border border-gcs-border/60 w-64 sm:w-72">
      {url && <audio ref={audioRef} src={url} preload="metadata" />}

      {/* Header Info */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-gcs-emerald/20 text-gcs-emerald flex items-center justify-center shrink-0">
            <Music className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-gcs-text block truncate leading-tight">
              {fileName}
            </span>
            <span className="text-[10px] text-gcs-muted block font-mono">
              {formatFileSize(fileSizeBytes) || 'Encrypted Audio'}
            </span>
          </div>
        </div>

        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="p-1 rounded-md text-gcs-muted hover:text-gcs-mint hover:bg-gcs-emerald/20 transition-colors"
            title="Download Audio"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Controls & Waveform */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!url}
          className="h-8 w-8 rounded-full bg-gcs-emerald text-white flex items-center justify-center shrink-0 hover:bg-[#00c28c] active:scale-95 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
        </button>

        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!url}
            className="w-full h-1.5 bg-gcs-border rounded-lg appearance-none cursor-pointer accent-gcs-emerald"
          />
          <div className="flex justify-between text-[10px] text-gcs-muted font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
