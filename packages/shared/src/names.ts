/**
 * Ticket names for rooms that generate identity instead of collecting it.
 * Word lists stay tiny and printable. Bright / Fox stay first so a zero
 * hash still lands on a stable, already-tested pair.
 */
export const ROOM_NAME_FIRST = [
  "Bright", "Quick", "Calm", "Bold", "Lucky", "Kind", "Sharp", "Sunny",
  "Amber", "Quiet", "Velvet", "Rapid", "Copper", "Lunar", "Witty", "Wild",
] as const;

export const ROOM_NAME_SECOND = [
  "Fox", "Moth", "Otter", "Finch", "Panda", "Gecko", "Lynx", "Koi",
  "Heron", "Badger", "Cicada", "Raven", "Orca", "Stoat", "Wren", "Newt",
] as const;

export function generatedRoomName(id: string): string {
  let value = 0;
  for (const character of id) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  const suffix = (value ^ (value >>> 16)).toString(36).toUpperCase().padStart(3, "0").slice(-3);
  return `${ROOM_NAME_FIRST[value % ROOM_NAME_FIRST.length]} ${ROOM_NAME_SECOND[Math.floor(value / ROOM_NAME_FIRST.length) % ROOM_NAME_SECOND.length]} ${suffix}`;
}
