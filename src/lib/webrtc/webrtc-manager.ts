/**
 * GCS CONNECT — WebRTC Call Manager
 * Orchestrates 1-to-1 Voice & Video calls with DTLS-SRTP mandatory media encryption.
 * Coordinates with Socket.IO signaling hub and REST call lifecycle endpoints.
 */

import { Socket } from 'socket.io-client';
import { defaultIceServers, WebRtcIceConfig } from './config';

export type CallState = 'IDLE' | 'CALLING' | 'RINGING' | 'CONNECTED' | 'ENDED';
export type CallType = 'VOICE' | 'VIDEO';

export interface WebRtcManagerOptions {
  socket?: Socket;
  iceConfig?: WebRtcIceConfig;
  onStateChange?: (state: CallState) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onError?: (error: Error) => void;
  onCallEnd?: (details: { reason?: string; durationSeconds?: number }) => void;
}

export class WebRtcManager {
  private socket?: Socket;
  private iceServers: RTCIceServer[];
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingOffer: RTCSessionDescriptionInit | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  public callId: string | null = null;
  public peerUserId: string | null = null;
  public callType: CallType = 'VOICE';
  public state: CallState = 'IDLE';
  public isAudioMuted: boolean = false;
  public isVideoMuted: boolean = false;

  private onStateChange?: (state: CallState) => void;
  private onLocalStream?: (stream: MediaStream) => void;
  private onRemoteStream?: (stream: MediaStream) => void;
  private onError?: (error: Error) => void;
  private onCallEnd?: (details: { reason?: string; durationSeconds?: number }) => void;

  constructor(options: WebRtcManagerOptions = {}) {
    this.socket = options.socket;
    this.iceServers = options.iceConfig?.iceServers || defaultIceServers;
    this.onStateChange = options.onStateChange;
    this.onLocalStream = options.onLocalStream;
    this.onRemoteStream = options.onRemoteStream;
    this.onError = options.onError;
    this.onCallEnd = options.onCallEnd;

    if (this.socket) {
      this.attachSocketListeners(this.socket);
    }
  }

  /**
   * Set or update active Socket.IO connection
   */
  public setSocket(socket: Socket): void {
    this.socket = socket;
    this.attachSocketListeners(socket);
  }

  private setState(newState: CallState): void {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  /**
   * Attach signaling listeners to Socket.IO instance
   */
  private attachSocketListeners(socket: Socket): void {
    socket.off('call:offer');
    socket.off('call:answer');
    socket.off('call:ice-candidate');
    socket.off('call:hangup');

    socket.on('call:offer', async (payload: { callId: string; fromUserId: string; offer: any }) => {
      if (this.callId && this.callId !== payload.callId) return;
      await this.handleRemoteOffer(payload.offer, payload.callId, payload.fromUserId);
    });

    socket.on('call:answer', async (payload: { callId: string; answer: any }) => {
      if (this.callId && this.callId !== payload.callId) return;
      await this.handleRemoteAnswer(payload.answer);
    });

    socket.on('call:ice-candidate', async (payload: { callId: string; candidate: any }) => {
      if (this.callId && this.callId !== payload.callId) return;
      await this.handleRemoteIceCandidate(payload.candidate);
    });

    socket.on('call:hangup', (payload: { callId: string; durationSeconds?: number }) => {
      if (this.callId && this.callId !== payload.callId) return;
      this.teardownCall('Remote peer disconnected', payload.durationSeconds);
    });
  }

  /**
   * Initialize PeerConnection with ICE configuration and event handlers
   */
  private async initPeerConnection(): Promise<RTCPeerConnection> {
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('WebRTC RTCPeerConnection is not supported in this environment.');
    }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.callId && this.peerUserId) {
        this.socket.emit('call:ice-candidate', {
          callId: this.callId,
          toUserId: this.peerUserId,
          candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }
      event.streams[0]?.getTracks().forEach((track) => {
        this.remoteStream?.addTrack(track);
      });
      this.onRemoteStream?.(this.remoteStream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.setState('CONNECTED');
      } else if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        if (this.state === 'CONNECTED') {
          this.teardownCall('WebRTC connection state: ' + pc.connectionState);
        }
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  /**
   * Acquire local audio/video media stream
   */
  private async acquireLocalStream(callType: CallType): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('MediaDevices.getUserMedia is not supported in this browser.');
    }

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        callType === 'VIDEO'
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.localStream = stream;
    this.onLocalStream?.(stream);
    return stream;
  }

  /**
   * Add local stream tracks to RTCPeerConnection
   */
  private addTracksToConnection(stream: MediaStream, pc: RTCPeerConnection): void {
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });
  }

  /**
   * Start an outgoing call to a recipient in a conversation
   */
  public async startCall(
    conversationId: string,
    recipientUserId: string,
    callType: CallType = 'VOICE'
  ): Promise<string> {
    try {
      this.setState('CALLING');
      this.callType = callType;
      this.peerUserId = recipientUserId;

      // 1. Acquire local media stream
      const stream = await this.acquireLocalStream(callType);

      // 2. Initiate Call in backend API
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, callType }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to initiate call');
      }

      const data = await response.json();
      this.callId = data.call.id;

      // 3. Create WebRTC Peer Connection and generate SDP Offer
      const pc = await this.initPeerConnection();
      this.addTracksToConnection(stream, pc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 4. Send SDP Offer via Socket.IO signaling hub
      if (this.socket) {
        this.socket.emit('call:offer', {
          callId: this.callId,
          toUserId: recipientUserId,
          offer: {
            type: offer.type,
            sdp: offer.sdp,
          },
        });
      }

      return this.callId!;
    } catch (err: any) {
      this.teardownCall(err.message);
      this.onError?.(err);
      throw err;
    }
  }

  /**
   * Register incoming call notification
   */
  public handleIncomingCall(callId: string, callerUserId: string, callType: CallType): void {
    this.callId = callId;
    this.peerUserId = callerUserId;
    this.callType = callType;
    this.setState('RINGING');
  }

  /**
   * Accept an incoming call
   */
  public async acceptIncomingCall(): Promise<void> {
    try {
      if (!this.callId || !this.peerUserId) {
        throw new Error('No active incoming call to accept.');
      }

      // 1. Acquire local media stream
      const stream = await this.acquireLocalStream(this.callType);

      // 2. Respond to backend API
      const response = await fetch(`/api/calls/${this.callId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ACCEPT' }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to accept call');
      }

      // 3. Initialize Peer Connection
      const pc = await this.initPeerConnection();
      this.addTracksToConnection(stream, pc);

      // 4. If remote offer already received, apply it and create answer
      if (this.pendingOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
        this.pendingOffer = null;

        // Drain any queued ICE candidates
        for (const candidate of this.pendingIceCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.pendingIceCandidates = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (this.socket) {
          this.socket.emit('call:answer', {
            callId: this.callId,
            toUserId: this.peerUserId,
            answer: {
              type: answer.type,
              sdp: answer.sdp,
            },
          });
        }
      }

      this.setState('CONNECTED');
    } catch (err: any) {
      this.teardownCall(err.message);
      this.onError?.(err);
      throw err;
    }
  }

  /**
   * Reject an incoming call
   */
  public async rejectIncomingCall(action: 'DECLINE' | 'BUSY' = 'DECLINE'): Promise<void> {
    try {
      if (this.callId) {
        await fetch(`/api/calls/${this.callId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
      }
    } finally {
      this.teardownCall(action === 'BUSY' ? 'User busy' : 'Call declined');
    }
  }

  /**
   * Process SDP offer received from remote caller
   */
  public async handleRemoteOffer(
    offer: RTCSessionDescriptionInit,
    callId: string,
    fromUserId: string
  ): Promise<void> {
    this.callId = callId;
    this.peerUserId = fromUserId;

    if (this.state === 'CONNECTED' && this.peerConnection) {
      // Re-negotiation or already accepted
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      if (this.socket) {
        this.socket.emit('call:answer', {
          callId: this.callId,
          toUserId: this.peerUserId,
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
        });
      }
    } else {
      // Store pending offer until user clicks Accept
      this.pendingOffer = offer;
    }
  }

  /**
   * Process SDP answer received from remote callee
   */
  public async handleRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      // Drain queued ICE candidates
      for (const candidate of this.pendingIceCandidates) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingIceCandidates = [];

      this.setState('CONNECTED');
    }
  }

  /**
   * Process ICE candidate trickled from remote peer
   */
  public async handleRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      this.pendingIceCandidates.push(candidate);
    }
  }

  /**
   * Toggle local microphone mute
   */
  public toggleAudio(forceState?: boolean): boolean {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) return false;

    audioTrack.enabled = forceState !== undefined ? forceState : !audioTrack.enabled;
    this.isAudioMuted = !audioTrack.enabled;
    return this.isAudioMuted;
  }

  /**
   * Toggle local camera video mute
   */
  public toggleVideo(forceState?: boolean): boolean {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return false;

    videoTrack.enabled = forceState !== undefined ? forceState : !videoTrack.enabled;
    this.isVideoMuted = !videoTrack.enabled;
    return this.isVideoMuted;
  }

  /**
   * Hang up and end the current call
   */
  public async hangup(): Promise<void> {
    const activeCallId = this.callId;
    const targetUserId = this.peerUserId;

    if (activeCallId) {
      try {
        if (this.socket && targetUserId) {
          this.socket.emit('call:hangup', { callId: activeCallId, toUserId: targetUserId });
        }
        await fetch(`/api/calls/${activeCallId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (err) {
        console.error('[WebRtcManager] Failed to post call end to server:', err);
      }
    }

    this.teardownCall('Call terminated by user');
  }

  /**
   * Teardown local tracks, peer connection, and reset state
   */
  private teardownCall(reason?: string, durationSeconds?: number): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.pendingOffer = null;
    this.pendingIceCandidates = [];
    this.callId = null;
    this.peerUserId = null;
    this.isAudioMuted = false;
    this.isVideoMuted = false;

    this.setState('ENDED');
    this.onCallEnd?.({ reason, durationSeconds });
  }

  /**
   * Get active media streams
   */
  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }
}
