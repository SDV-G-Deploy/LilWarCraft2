/**
 * session.ts
 * PeerJS wrapper implementing a simple input-lockstep protocol.
 *
 * Protocol:
 *   Each sim tick both peers exchange a TickPacket { tick, cmds }.
 *   The sim only advances once BOTH sides' packets for that tick arrive.
 *   Latency ≤ one tick-period (50 ms at 20 Hz) feels instant on LAN / same country.
 *
 * Host flow:  new NetSession('host')        → wait for peer.on('connection')
 * Guest flow: new NetSession('guest', code) → peer.connect(code)
 */

import Peer, { DataConnection } from 'peerjs';
import type { NetCmd, TickPacket } from './netcmd';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionStatus =
  | 'init'          // PeerJS opening
  | 'waiting'       // host: waiting for guest to connect
  | 'connecting'    // guest: dialling host
  | 'ready'         // data channel open, game can start
  | 'disconnected'  // peer left
  | 'error';

export interface NetSession {
  readonly role:   'host' | 'guest';
  readonly code:   string;          // 6-char room code (= host's peer ID)
  status:          SessionStatus;
  statusMsg:       string;
  onStatusChange?: () => void;

  /** Buffer a command to be sent this tick. */
  push(cmd: NetCmd): void;

  /**
   * Called once per sim tick.
   * - Sends local commands buffered since last call to the peer.
   * - Returns the peer's commands for this tick, or null if not yet received.
   *   When null: caller should stall (don't advance the sim).
   */
  exchange(tick: number): NetCmd[] | null;

  destroy(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSession(
  role: 'host' | 'guest',
  hostCode?: string,               // required when role === 'guest'
): NetSession {

  // ── State ──────────────────────────────────────────────────────────────────
  let conn: DataConnection | null = null;
  let localBuf: NetCmd[] = [];

  // tick → cmds received from peer
  const remoteQueue = new Map<number, NetCmd[]>();

  // local cmds we already sent (keyed by tick) — for re-send on stall
  const localSent   = new Map<number, NetCmd[]>();

  const session: NetSession = {
    role,
    code:      hostCode ?? '',   // filled in once peer opens
    status:    'init',
    statusMsg: 'Initialising…',

    push(cmd) { localBuf.push(cmd); },

    exchange(tick) {
      const toSend = localBuf;
      localBuf = [];
      localSent.set(tick, toSend);

      if (conn?.open) {
        const pkt: TickPacket = { tick, cmds: toSend };
        conn.send(pkt);
      }

      const remote = remoteQueue.get(tick);
      if (remote !== undefined) {
        remoteQueue.delete(tick);
        return remote;
      }
      return null;
    },

    destroy() {
      conn?.close();
      peer.destroy();
    },
  };

  // ── PeerJS setup ───────────────────────────────────────────────────────────
  // Always auto-generate IDs; PeerJS constructor signature requires (id?, options?)
  const peer = new Peer({
    host:   '0.peerjs.com',
    port:   443,
    path:   '/',
    secure: true,
    debug:  0,
  });

  function setupConn(c: DataConnection) {
    conn = c;

    c.on('open', () => {
      session.status    = 'ready';
      session.statusMsg = 'Connected!';
      session.onStatusChange?.();
    });

    c.on('data', (raw) => {
      const pkt = raw as TickPacket;
      if (typeof pkt.tick === 'number' && Array.isArray(pkt.cmds)) {
        remoteQueue.set(pkt.tick, pkt.cmds);
      }
    });

    c.on('close', () => {
      session.status    = 'disconnected';
      session.statusMsg = 'Opponent disconnected';
      session.onStatusChange?.();
    });

    c.on('error', (err) => {
      session.status    = 'error';
      session.statusMsg = `Connection error: ${(err as Error).message}`;
      session.onStatusChange?.();
    });
  }

  peer.on('open', (id) => {
    // Expose the code (always the host's ID)
    (session as { code: string }).code = role === 'host' ? id : hostCode!;

    if (role === 'host') {
      session.status    = 'waiting';
      session.statusMsg = `Room code: ${id}`;
      session.onStatusChange?.();

      peer.on('connection', (c) => {
        setupConn(c);
      });
    } else {
      session.status    = 'connecting';
      session.statusMsg = 'Connecting to host…';
      session.onStatusChange?.();

      const c = peer.connect(hostCode!, { reliable: true, serialization: 'json' });
      setupConn(c);
    }
  });

  peer.on('error', (err) => {
    session.status    = 'error';
    session.statusMsg = `PeerJS error: ${(err as Error).message}`;
    session.onStatusChange?.();
  });

  return session;
}
