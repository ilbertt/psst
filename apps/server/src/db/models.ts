export type Room = {
  id: string;
  code: string;
  name: string;
  created_at: string;
};

export type Peer = {
  id: string;
  room_id: string;
  name: string;
  joined_at: string;
};
