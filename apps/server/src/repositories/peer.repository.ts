import type { Database, Statement } from 'bun:sqlite';
import type { Peer } from '#db/models.ts';
import { Repository } from '#repositories/repository.ts';

export class PeerRepository extends Repository {
  private readonly stmtCreate: Statement<Peer, [string, string, string]>;
  private readonly stmtFindByRoomId: Statement<Peer, [string]>;
  private readonly stmtDelete: Statement<void, [string]>;

  constructor(db: Database) {
    super(db);
    this.stmtCreate = db.query<Peer, [string, string, string]>(
      'INSERT INTO peers (id, room_id, name) VALUES (?, ?, ?) RETURNING *',
    );
    this.stmtFindByRoomId = db.query<Peer, [string]>('SELECT * FROM peers WHERE room_id = ?');
    this.stmtDelete = db.query<void, [string]>('DELETE FROM peers WHERE id = ?');
  }

  create({ id, roomId, name }: { id: string; roomId: string; name: string }): Peer {
    return this.stmtCreate.get(id, roomId, name)!;
  }

  findByRoomId(roomId: string): Peer[] {
    return this.stmtFindByRoomId.all(roomId);
  }

  delete(id: string): void {
    this.stmtDelete.run(id);
  }
}
