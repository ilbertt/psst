import type { Peer, Room } from '#types.ts';

export class ApiClient {
  constructor(public baseUrl: string) {}

  async createRoom(): Promise<Room> {
    // TODO: Replace with actual server call
    const room: Room = {
      code: Math.random().toString(36).substring(2, 8).toUpperCase(),
      name: '',
      createdAt: new Date().toISOString(),
    };
    return room;
  }

  async joinRoom(params: { code: string; displayName: string }): Promise<Room> {
    // TODO: Replace with actual server call
    const room: Room = {
      code: params.code,
      name: 'Room',
      createdAt: new Date().toISOString(),
    };
    return room;
  }

  async leaveRoom(_code: string): Promise<void> {
    // TODO: Replace with actual server call
  }

  async getRoomMembers(_code: string): Promise<Peer[]> {
    // TODO: Replace with actual server call
    return [
      { id: '1', name: 'Alice', joinedAt: new Date().toISOString() },
      { id: '2', name: 'Bob', joinedAt: new Date().toISOString() },
      { id: '3', name: 'Charlie', joinedAt: new Date().toISOString() },
    ];
  }
}
