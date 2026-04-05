import { generateCode } from '#lib/code.ts';
import { NotFoundError } from '#lib/errors.ts';
import type { PeerRepository } from '#repositories/peer.repository.ts';
import type { RoomRepository } from '#repositories/room.repository.ts';

interface RoomServiceDeps {
  roomRepo: RoomRepository;
  peerRepo: PeerRepository;
}

interface Resolver<T> {
  resolve: (value: T) => void;
  timer: Timer;
  excludePeerId: string;
}

interface PeerInfo {
  id: string;
  name: string;
  joined_at: string;
}

const POLL_TIMEOUT_MS = 30_000;

export class RoomService {
  private roomRepo: RoomRepository;
  private peerRepo: PeerRepository;
  private peerPollers = new Map<string, Resolver<PeerInfo[]>[]>();

  constructor({ roomRepo, peerRepo }: RoomServiceDeps) {
    this.roomRepo = roomRepo;
    this.peerRepo = peerRepo;
  }

  create(name = '') {
    const id = Bun.randomUUIDv7();
    const code = generateCode();
    return this.roomRepo.create({ id, code, name });
  }

  join({ code, name }: { code: string; name: string }) {
    const room = this.roomRepo.findByCode(code);
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    const id = Bun.randomUUIDv7();
    const peer = this.peerRepo.create({ id, roomId: room.id, name });
    this.notifyPeerChange(room.id);
    return peer;
  }

  pollPeers({
    code,
    excludePeerId,
  }: {
    code: string;
    excludePeerId: string;
  }): Promise<PeerInfo[] | null> {
    const room = this.roomRepo.findByCode(code);
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    const currentPeers = this.peerRepo.findByRoomId(room.id).filter((p) => p.id !== excludePeerId);
    if (currentPeers.length > 0) {
      return Promise.resolve(currentPeers);
    }

    return new Promise<PeerInfo[] | null>((resolve) => {
      const timer = setTimeout(() => {
        this.removePoller({ roomId: room.id, resolver });
        resolve(null);
      }, POLL_TIMEOUT_MS);

      const resolver: Resolver<PeerInfo[]> = { resolve, timer, excludePeerId };

      const pollers = this.peerPollers.get(room.id) ?? [];
      pollers.push(resolver);
      this.peerPollers.set(room.id, pollers);
    });
  }

  private notifyPeerChange(roomId: string) {
    const pollers = this.peerPollers.get(roomId);
    if (!pollers || pollers.length === 0) {
      return;
    }

    const allPeers = this.peerRepo.findByRoomId(roomId);

    for (const poller of pollers) {
      clearTimeout(poller.timer);
      poller.resolve(allPeers.filter((p) => p.id !== poller.excludePeerId));
    }

    this.peerPollers.delete(roomId);
  }

  private removePoller({ roomId, resolver }: { roomId: string; resolver: Resolver<PeerInfo[]> }) {
    const pollers = this.peerPollers.get(roomId);
    if (!pollers) {
      return;
    }

    const idx = pollers.indexOf(resolver);
    if (idx !== -1) {
      pollers.splice(idx, 1);
    }

    if (pollers.length === 0) {
      this.peerPollers.delete(roomId);
    }
  }
}
