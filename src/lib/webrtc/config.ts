/**
 * GCS CONNECT — WebRTC ICE Server Configuration
 * Configures public STUN servers for NAT traversal and fallback TURN servers.
 * Media streams are secured peer-to-peer via mandatory DTLS-SRTP encryption.
 */

export interface WebRtcIceConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize: number;
}

export const defaultIceServers: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

/**
 * Returns active WebRTC ICE configuration, incorporating custom TURN servers if configured
 */
export function getWebRtcConfig(): WebRtcIceConfig {
  const iceServers: RTCIceServer[] = [...defaultIceServers];

  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
  };
}
