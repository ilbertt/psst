import { generateCode } from '#lib/code.ts';
import { NotFoundError } from '#lib/errors.ts';
import type { PeerRepository } from '#repositories/peer.repository.ts';
import type { RoomRepository } from '#repositories/room.repository.ts';

interface RoomServiceDeps {
  roomRepo: RoomRepository;
  peerRepo: PeerRepository;
}

export class RoomService {
  private roomRepo: RoomRepository;
  private peerRepo: PeerRepository;

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
    if (!room) throw new NotFoundError('Room not found');

    const id = Bun.randomUUIDv7();
    return this.peerRepo.create({ id, roomId: room.id, name });
  }

  peers(code: string) {
    const room = this.roomRepo.findByCode(code);
    if (!room) throw new NotFoundError('Room not found');
    return this.peerRepo.findByRoomId(room.id);
  }

  leave(peerId: string) {
    this.peerRepo.delete(peerId);
  }
}
