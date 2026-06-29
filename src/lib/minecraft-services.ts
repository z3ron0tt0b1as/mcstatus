/**
 * The canonical list of monitored Minecraft/Mojang service endpoints. Shared by
 * the status probe and anywhere that needs to turn a service id into a human
 * name (e.g. the subscription confirmation email). Server-safe (no imports).
 */

export type MinecraftService = { id: string; name: string; url: string };

export const MINECRAFT_SERVICES: MinecraftService[] = [
  {
    id: "session",
    name: "Mojang Session Server",
    url: "https://sessionserver.mojang.com/blockedservers",
  },
  {
    id: "u2uuid",
    name: "Minecraft Username to UUID (Notch)",
    url: "https://api.mojang.com/users/profiles/minecraft/Notch",
  },
  {
    id: "uuid2profile",
    name: "Minecraft UUID to Profile",
    url: "https://sessionserver.mojang.com/session/minecraft/profile/069a79f444e94726a5befca90e38aaf5",
  },
  {
    id: "services",
    name: "Minecraft Services API",
    url: "https://api.minecraftservices.com/minecraft/profile",
  },
  {
    id: "textures",
    name: "Minecraft Textures",
    url: "https://textures.minecraft.net/",
  },
  {
    id: "auth",
    name: "Minecraft Auth",
    // Legacy authserver.mojang.com was decommissioned (Microsoft migration);
    // this is the current Minecraft services auth endpoint (403 = reachable).
    url: "https://api.minecraftservices.com/authentication/login_with_xbox",
  },
  {
    id: "profile",
    name: "Minecraft Profile",
    url: "https://api.minecraftservices.com/minecraft/profile/lookup/name/notch",
  },
  {
    id: "bedrock-realms",
    name: "Bedrock Realms",
    url: "https://pocket.realms.minecraft.net/worlds",
  },
  {
    id: "java-realms",
    name: "Java Realms",
    url: "https://pc.realms.minecraft.net/worlds",
  },
  {
    id: "dungeons-signal",
    name: "Dungeons Multiplayer Signaling",
    url: "https://piston-meta.mojang.com/v1/products/dungeons/dungeons.json",
  },
  {
    id: "dungeons-relay",
    name: "Dungeons Multiplayer Relay",
    url: "https://piston-data.mojang.com/",
  },
];

const NAME_BY_ID = new Map(MINECRAFT_SERVICES.map((s) => [s.id, s.name]));

/** Human-readable name for a service id (falls back to the id itself). */
export function serviceName(id: string): string {
  return NAME_BY_ID.get(id) ?? id;
}
