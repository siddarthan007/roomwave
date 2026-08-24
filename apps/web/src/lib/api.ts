import type {
  Activity,
  CreateActivityInput,
  PublicRoom,
  RoomSettings,
  RoomState,
} from "@roomwave/shared";

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(
  /\/$/,
  "",
);

export function apiUrl(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

type ApiErrorBody = {
  error?: {
    message?: string;
  };
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers });
  } catch {
    throw new Error("Roomwave API is offline. Start both services with bun run dev.");
  }
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = body as ApiErrorBody | null;
    throw new Error(
      error?.error?.message ?? `Request failed: ${response.status}`,
    );
  }

  return body as T;
}

export function createRoom(title: string, settings?: Partial<RoomSettings>) {
  return request<{ room: PublicRoom; hostToken: string }>("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ title, settings }),
  });
}

export function joinRoom(code: string, profile: { displayName?: string; avatarSeed: string }) {
  return request<{
    room: PublicRoom;
    participant: { id: string; displayName: string; avatarSeed: string };
    token: string;
  }>(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify(profile),
  });
}

export function updateRoomSettings(
  roomId: string,
  hostToken: string,
  settings: RoomSettings,
) {
  return request<{ settings: RoomSettings }>(`/api/rooms/${roomId}/settings`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify(settings),
  });
}

export function touchPresence(roomId: string, participantToken: string) {
  return request<{ success: true }>(`/api/rooms/${roomId}/presence`, {
    method: "POST",
    headers: { Authorization: `Bearer ${participantToken}` },
  });
}

export function getRoomState(roomId: string, init?: RequestInit) {
  return request<RoomState>(`/api/rooms/${roomId}/state`, init);
}

export type CreateActivityPayload = CreateActivityInput;

export function createActivity(
  roomId: string,
  hostToken: string,
  payload: CreateActivityPayload,
) {
  return request<Activity>(`/api/rooms/${roomId}/activities`, {
    method: "POST",
    headers: { Authorization: `Bearer ${hostToken}` },
    body: JSON.stringify(payload),
  });
}

export function activityAction(
  activityId: string,
  action: "start" | "lock" | "reopen" | "reveal" | "reset" | "end",
  hostToken: string,
) {
  return request<{ success: boolean }>(
    `/api/activities/${activityId}/${action}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${hostToken}` },
    },
  );
}

export function submitResponse(
  activityId: string,
  participantToken: string,
  payload: unknown,
) {
  return request<{ success: boolean }>(
    `/api/activities/${activityId}/responses`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${participantToken}` },
      body: JSON.stringify(payload),
    },
  );
}

export function setQuestionAnswered(
  activityId: string,
  questionId: string,
  answered: boolean,
  hostToken: string,
) {
  return request<{
    success: boolean;
    moderation?: "pending" | "visible" | "hidden";
  }>(
    `/api/activities/${activityId}/questions/${questionId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${hostToken}` },
      body: JSON.stringify({ answered }),
    },
  );
}

export interface ModerationItem {
  id: string;
  text: string;
  status: "pending" | "visible" | "hidden";
  createdAt: string;
}

export function getModerationQueue(
  activityId: string,
  hostToken: string,
) {
  return request<{ items: ModerationItem[] }>(
    `/api/activities/${activityId}/moderation`,
    { headers: { Authorization: `Bearer ${hostToken}` } },
  );
}

export function setModerationStatus(
  activityId: string,
  responseId: string,
  status: "visible" | "hidden",
  hostToken: string,
) {
  return request<{ success: boolean }>(
    `/api/activities/${activityId}/moderation/${responseId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${hostToken}` },
      body: JSON.stringify({ status }),
    },
  );
}

export function sendReaction(
  roomId: string,
  participantToken: string,
  kind: string,
) {
  return fetch(apiUrl("/api/activities/reactions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Room-Id": roomId,
      Authorization: `Bearer ${participantToken}`,
    },
    body: JSON.stringify({ kind }),
  }).catch(() => null);
}
