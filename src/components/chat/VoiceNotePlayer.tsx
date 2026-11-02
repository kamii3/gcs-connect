'use strict';
/**
 * GCS CONNECT — Voice Note Player Component
 * Black & Emerald Theme (#00A879 Accent, #121816 Dark Surface)
 * Decrypted audio playback strictly in browser memory.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, RotateCcw } from 'lucide-react';

interface VoiceNotePlayerProps {
  audioBlobUrl: string;
  durationSeconds?: number;
  isSent?: boolean;
}

export const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  audioBlobUrl,
  durationSeconds = 0,
  isSent = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSeconds);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(audioBlobUrl);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [audioBlobUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-xl border max-w-sm ${
        isSent
          ? 'bg-[#205B45] border-[#31463A] text-[#F0F5F1]'
          : 'bg-[#25372E] border-[#31463A] text-[#F0F5F1]'
      }`}
    >
      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-[#00A879] hover:bg-[#008f66] text-[#121816] flex items-center justify-center transition-all flex-shrink-0 shadow-md active:scale-95"
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Progress & Waveform */}
      <div className="flex-1 flex flex-col gap-1 min-w-[140px]">
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1.5 bg-[#151D19] rounded-lg appearance-none cursor-pointer accent-[#00A879]"
        />
        <div className="flex justify-between items-center text-xs text-[#A4B5AA]">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Speed Rate Toggle */}
      <button
        onClick={cyclePlaybackRate}
        className="px-2 py-0.5 rounded text-xs font-semibold bg-[#151D19] border border-[#31463A] text-[#B6F1D9] hover:bg-[#1C2420] transition-colors"
      >
        {playbackRate}x
      </button>
    </div>
  );
};
