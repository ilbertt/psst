import type { Database, Statement } from 'bun:sqlite';
import type { Room } from '#db/models.ts';
import { Repository } from '#repositories/repository.ts';

export class RoomRepository extends Repository {
  private readonly stmtCreate: Statement<Room, [string, string, string]>;
  private readonly stmtFindByCode: Statement<Room, [string]>;

  constructor(db: Database) {
    super(db);
    this.stmtCreate = db.query<Room, [string, string, string]>(
      'INSERT INTO rooms (id, code, name) VALUES (?, ?, ?) RETURNING *',
    );
    this.stmtFindByCode = db.query<Room, [string]>('SELECT * FROM rooms WHERE code = ?');
  }

  create({ id, code, name }: { id: string; code: string; name: string }): Room {
    return this.stmtCreate.get(id, code, name)!;
  }

  findByCode(code: string): Room | null {
    return this.stmtFindByCode.get(code);
  }
}
