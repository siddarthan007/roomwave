path = "apps/web/src/lib/api.ts"
text = open(path, encoding="utf-8", newline="").read()
old = (
    "export function getRoomState(\n"
    "  roomId: string,\n"
    "  init?: RequestInit,\n"
    ") {\n"
    "\n"
    "  return request<RoomState>(`/api/rooms/${roomId}/state`);\n"
    "}\n"
)
new = (
    "export function getRoomState(roomId: string, init?: RequestInit) {\n"
    "  return request<RoomState>(`/api/rooms/${roomId}/state`, init);\n"
    "}\n"
)
assert text.count(old) == 1
text = text.replace(old, new)
open(path, "w", encoding="utf-8", newline="").write(text)
print("ok")
