interface Resolver<T> {
  resolve: (value: T) => void;
  timer: Timer;
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

interface PendingCall {
  callerId: string;
  offer: unknown;
}

const POLL_TIMEOUT = 30_000;

export class SignalService {
  private callers = new Map<string, Resolver<CallAnswer>>();
  private pendingCalls = new Map<string, PendingCall>();
  private listeners = new Map<string, Resolver<CallOffer>>();
  private icePollers = new Map<string, Resolver<IceCandidate>>();

  call({
    callerId,
    targetPeerId,
    offer,
  }: {
    callerId: string;
    targetPeerId: string;
    offer: unknown;
  }): Promise<CallAnswer | null> {
    const listener = this.listeners.get(targetPeerId);
    if (listener) {
      clearTimeout(listener.timer);
      this.listeners.delete(targetPeerId);
      listener.resolve({ from: callerId, offer });
    } else {
      this.pendingCalls.set(targetPeerId, { callerId, offer });
    }

    return new Promise<CallAnswer | null>((resolve) => {
      const timer = setTimeout(() => {
        this.callers.delete(callerId);
        this.pendingCalls.delete(targetPeerId);
        resolve(null);
      }, POLL_TIMEOUT);

      this.callers.set(callerId, { resolve, timer });
    });
  }

  pollCalls(peerId: string): Promise<CallOffer | null> {
    const pending = this.pendingCalls.get(peerId);
    if (pending) {
      this.pendingCalls.delete(peerId);
      return Promise.resolve({ from: pending.callerId, offer: pending.offer });
    }

    return new Promise<CallOffer | null>((resolve) => {
      const timer = setTimeout(() => {
        this.listeners.delete(peerId);
        resolve(null);
      }, POLL_TIMEOUT);

      this.listeners.set(peerId, { resolve, timer });
    });
  }

  answer({ callerPeerId, answer }: { callerPeerId: string; answer: unknown }): boolean {
    const caller = this.callers.get(callerPeerId);
    if (!caller) return false;

    clearTimeout(caller.timer);
    this.callers.delete(callerPeerId);
    caller.resolve({ answer });
    return true;
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
    const poller = this.icePollers.get(targetPeerId);
    if (!poller) return false;

    clearTimeout(poller.timer);
    this.icePollers.delete(targetPeerId);
    poller.resolve({ from: fromPeerId, candidate });
    return true;
  }

  pollIce(peerId: string): Promise<IceCandidate | null> {
    return new Promise<IceCandidate | null>((resolve) => {
      const timer = setTimeout(() => {
        this.icePollers.delete(peerId);
        resolve(null);
      }, POLL_TIMEOUT);

      this.icePollers.set(peerId, { resolve, timer });
    });
  }

  cleanup(peerId: string) {
    for (const map of [this.callers, this.listeners, this.icePollers]) {
      const entry = map.get(peerId);
      if (entry) {
        clearTimeout(entry.timer);
        map.delete(peerId);
      }
    }
    this.pendingCalls.delete(peerId);
  }
}
