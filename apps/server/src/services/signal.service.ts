const POLL_TIMEOUT = 30_000;

interface Resolver<T> {
  resolve: (value: T) => void;
  timer: Timer;
}

class Exchange<T> {
  private pollers = new Map<string, Resolver<T>>();
  private pending = new Map<string, T[]>();

  send({ targetId, value }: { targetId: string; value: T }): boolean {
    const poller = this.pollers.get(targetId);
    if (poller) {
      clearTimeout(poller.timer);
      this.pollers.delete(targetId);
      poller.resolve(value);
      return true;
    }

    const queue = this.pending.get(targetId);
    if (queue) {
      queue.push(value);
    } else {
      this.pending.set(targetId, [value]);
    }
    return true;
  }

  poll(peerId: string): Promise<T | null> {
    const queue = this.pending.get(peerId);
    if (queue && queue.length > 0) {
      const value = queue.shift()!;
      if (queue.length === 0) {
        this.pending.delete(peerId);
      }
      return Promise.resolve(value);
    }

    return new Promise<T | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pollers.delete(peerId);
        resolve(null);
      }, POLL_TIMEOUT);

      this.pollers.set(peerId, { resolve, timer });
    });
  }

  cleanup(peerId: string) {
    const poller = this.pollers.get(peerId);
    if (poller) {
      clearTimeout(poller.timer);
      this.pollers.delete(peerId);
    }
    this.pending.delete(peerId);
  }
}

interface CallOffer {
  from: string;
  offer: unknown;
}

interface CallAnswer {
  answer: unknown;
}

interface IceCandidate {
  from: string;
  candidate: unknown;
}

export class SignalService {
  private calls = new Exchange<CallOffer>();
  private answers = new Exchange<CallAnswer>();
  private ice = new Exchange<IceCandidate>();

  call({
    callerId,
    targetPeerId,
    offer,
  }: {
    callerId: string;
    targetPeerId: string;
    offer: unknown;
  }): Promise<CallAnswer | null> {
    this.calls.send({ targetId: targetPeerId, value: { from: callerId, offer } });
    return this.answers.poll(callerId);
  }

  pollCalls(peerId: string): Promise<CallOffer | null> {
    return this.calls.poll(peerId);
  }

  answer({ callerPeerId, answer }: { callerPeerId: string; answer: unknown }): boolean {
    return this.answers.send({ targetId: callerPeerId, value: { answer } });
  }

  sendIce({
    fromPeerId,
    targetPeerId,
    candidate,
  }: {
    fromPeerId: string;
    targetPeerId: string;
    candidate: unknown;
  }): boolean {
    return this.ice.send({ targetId: targetPeerId, value: { from: fromPeerId, candidate } });
  }

  pollIce(peerId: string): Promise<IceCandidate | null> {
    return this.ice.poll(peerId);
  }

  cleanup(peerId: string) {
    this.calls.cleanup(peerId);
    this.answers.cleanup(peerId);
    this.ice.cleanup(peerId);
  }
}
