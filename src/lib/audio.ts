/**
 * GCS CONNECT — Authentic WhatsApp Audio & Sound Engine
 * Handles user sound feedback for sending, receiving, and calling.
 */

export function playSound(sound: 'sent' | 'received' | 'call_connect' | 'call_hangup' | 'ringtone'): void {
  if (typeof window === 'undefined') return;
  try {
    const soundMap: Record<string, string> = {
      sent: '/sounds/message_sent.m4a',
      received: '/sounds/message_received.m4a',
      call_connect: '/sounds/call_connect.m4a',
      call_hangup: '/sounds/call_hangup.m4a',
      ringtone: '/sounds/ringtone.ogg',
    };

    const soundUrl = soundMap[sound];
    if (!soundUrl) return;

    const audio = new Audio(soundUrl);
    audio.volume = 0.6;
    audio.play().catch(() => {
      // Audio playback might be prevented by browser user-interaction policies until clicked
    });
  } catch {
    // Gracefully ignore audio failures
  }
}
