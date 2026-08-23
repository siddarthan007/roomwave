import type {
  RoomEvent,
} from "@roomwave/shared";

type Listener = (
  event: RoomEvent,
) => void | Promise<void>;

class RoomHub {
  private rooms =
    new Map<
      string,
      Set<Listener>
    >();

  subscribe(
    roomId: string,
    listener: Listener,
  ) {
    let listeners =
      this.rooms.get(roomId);

    if (!listeners) {
      listeners =
        new Set<Listener>();

      this.rooms.set(
        roomId,
        listeners,
      );
    }

    listeners.add(listener);

    return () => {
      listeners?.delete(
        listener,
      );

      if (
        listeners?.size === 0
      ) {
        this.rooms.delete(
          roomId,
        );
      }
    };
  }

  publish(
    roomId: string,
    event: RoomEvent,
  ) {
    const listeners =
      this.rooms.get(roomId);

    if (!listeners) {
      return;
    }

    for (
      const listener of listeners
    ) {
      Promise.resolve(
        listener(event),
      ).catch((error) => {
        console.error(
          "RoomHub listener error",
          error,
        );
      });
    }
  }

  /** Read-only observability hook used by connection tests and local metrics. */
  subscriberCount(roomId: string): number {
    return this.rooms.get(roomId)?.size ?? 0;
  }

  totalSubscriberCount(): number {
    let total = 0;
    for (const listeners of this.rooms.values()) total += listeners.size;
    return total;
  }
}

export const roomHub =
  new RoomHub();
