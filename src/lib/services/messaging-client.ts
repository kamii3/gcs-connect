/**
 * GCS CONNECT — Client-Side End-to-End Encryption Messaging Service
 * Coordinates X3DH key negotiation, Double Ratchet encryption/decryption,
 * and Zero-Plaintext message dispatching between client devices.
 */

import { ClientCryptoVault } from '@/lib/crypto/storage-vault';
import { initiateX3DH, respondX3DH } from '@/lib/crypto/x3dh';
import {
  initSenderSession,
  initReceiverSession,
  encryptRatchetMessage,
  decryptRatchetMessage,
} from '@/lib/crypto/double-ratchet';
import {
  PrekeyBundle,
  RatchetMessagePayload,
  X3DHInitiationPayload,
} from '@/lib/crypto/types';

export interface DecryptedMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderDeviceId: string;
  plaintext: string;
  messageType: string;
  createdAt: Date;
  isEdited: boolean;
  isDeletedForEveryone: boolean;
}

export class MessagingClient {
  public userDeviceMap: Map<string, string> = new Map();

  constructor(public vault: ClientCryptoVault) {}

  /**
   * Encrypt and dispatch a message to a direct conversation
   */
  public async prepareDirectMessage(
    recipientUserId: string,
    plaintext: string,
    fetchPrekeyBundle: (userId: string) => Promise<PrekeyBundle>
  ): Promise<{
    payload: {
      recipientDeviceId: string;
      messageType: 'TEXT';
      encryptedPayload: string;
      initializationVector: string;
      authTag: string;
      ephemeralKey: string;
      ratchetSequenceNumber: number;
      previousChainLength: number;
    };
    x3dhPayload?: X3DHInitiationPayload;
  }> {
    if (!this.vault.identityKeyPair) {
      throw new Error('Client crypto vault is uninitialized');
    }

    // Check if an existing ratchet session is stored for recipient
    const recipientDeviceId = this.userDeviceMap.get(recipientUserId);
    let session = recipientDeviceId ? this.vault.getSession(recipientDeviceId) : null;
    let x3dhPayload: X3DHInitiationPayload | undefined;

    if (!session) {
      // 1. Fetch recipient's public prekey bundle from server
      const bundle = await fetchPrekeyBundle(recipientUserId);
      this.userDeviceMap.set(recipientUserId, bundle.deviceId);

      // Check if session exists under bundle device ID
      session = this.vault.getSession(bundle.deviceId);

      if (!session) {
        // 2. Perform X3DH key agreement
        const x3dhResult = await initiateX3DH(this.vault.identityKeyPair, bundle);
        x3dhPayload = x3dhResult.initiationPayload;

        // 3. Initialize Sender Double Ratchet Session
        session = await initSenderSession(
          bundle.deviceId,
          bundle.identityKey,
          x3dhResult.sharedSecret,
          x3dhResult.aliceEphemeralKeyPair,
          bundle.signedPrekey.publicKey
        );

        this.vault.saveSession(session);
      }
    }

    // 4. Encrypt message using Double Ratchet
    const encResult = await encryptRatchetMessage(session, plaintext, x3dhPayload);
    this.vault.saveSession(encResult.session);

    return {
      payload: {
        recipientDeviceId: encResult.message.recipientDeviceId,
        messageType: 'TEXT',
        encryptedPayload: encResult.message.ciphertext,
        initializationVector: encResult.message.iv,
        authTag: encResult.message.authTag,
        ephemeralKey: encResult.message.ephemeralKey,
        ratchetSequenceNumber: encResult.message.sequenceNumber,
        previousChainLength: encResult.message.previousChainLength,
      },
      x3dhPayload,
    };
  }

  /**
   * Decrypt an incoming ciphertext message in memory
   */
  public async decryptMessage(
    senderUserId: string,
    message: {
      id: string;
      conversationId: string;
      senderDeviceId: string;
      encryptedPayload: string;
      initializationVector: string;
      authTag: string;
      ephemeralKey?: string | null;
      ratchetSequenceNumber: number;
      previousChainLength: number;
      messageType: string;
      createdAt: Date;
      isEdited: boolean;
      isDeletedForEveryone: boolean;
    },
    x3dhInitiationPayload?: X3DHInitiationPayload
  ): Promise<DecryptedMessage> {
    if (message.isDeletedForEveryone) {
      return {
        id: message.id,
        conversationId: message.conversationId,
        senderUserId,
        senderDeviceId: message.senderDeviceId,
        plaintext: 'This message was deleted.',
        messageType: message.messageType,
        createdAt: message.createdAt,
        isEdited: message.isEdited,
        isDeletedForEveryone: true,
      };
    }

    if (!this.vault.identityKeyPair || !this.vault.signedPrekey) {
      throw new Error('Client crypto vault is uninitialized');
    }

    // Map sender user to device
    this.userDeviceMap.set(senderUserId, message.senderDeviceId);

    let session = this.vault.getSession(message.senderDeviceId);

    // If no existing session and X3DH initiation payload is present, initialize receiver
    if (!session && x3dhInitiationPayload) {
      // Find consumed OPK if specified
      let consumedOpk = null;
      if (x3dhInitiationPayload.oneTimePrekeyId !== undefined) {
        consumedOpk = this.vault.consumeOneTimePrekey(x3dhInitiationPayload.oneTimePrekeyId);
      }

      // Compute X3DH shared secret
      const sharedSecret = await respondX3DH(
        this.vault.identityKeyPair,
        this.vault.signedPrekey.keyPair,
        consumedOpk,
        x3dhInitiationPayload
      );

      // Initialize Receiver Double Ratchet Session
      session = await initReceiverSession(
        message.senderDeviceId,
        x3dhInitiationPayload.senderIdentityKey,
        sharedSecret,
        this.vault.signedPrekey.keyPair,
        x3dhInitiationPayload.ephemeralKey
      );

      this.vault.saveSession(session);
    }

    if (!session) {
      throw new Error('Cannot decrypt message: No active ratchet session and no X3DH initiation payload');
    }

    const ratchetMsg: RatchetMessagePayload = {
      senderDeviceId: message.senderDeviceId,
      recipientDeviceId: this.vault.deviceId,
      ephemeralKey: message.ephemeralKey || '',
      sequenceNumber: message.ratchetSequenceNumber,
      previousChainLength: message.previousChainLength,
      ciphertext: message.encryptedPayload,
      iv: message.initializationVector,
      authTag: message.authTag,
    };

    const decResult = await decryptRatchetMessage(session, ratchetMsg);
    this.vault.saveSession(decResult.session);

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderUserId,
      senderDeviceId: message.senderDeviceId,
      plaintext: decResult.plaintext,
      messageType: message.messageType,
      createdAt: message.createdAt,
      isEdited: message.isEdited,
      isDeletedForEveryone: false,
    };
  }
}
