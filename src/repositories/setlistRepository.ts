import { Prisma, type Setlist } from "@prisma/client";
import { prisma } from "../db/client.js";

// Refresh lastAccessedAt at most once per day per setlist to keep GET writes rare.
const LAST_ACCESSED_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type SetlistWriteInput = {
  title: string;
  description?: string;
  items?: Array<{
    songId: string;
  }>;
};

async function computeContentHash(input: {
  title: string;
  description: string | null;
  songIds: string[];
}) {
  const canonical = JSON.stringify([input.title, input.description, input.songIds]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function touchLastAccessedAt(setlist: Setlist) {
  if (Date.now() - setlist.lastAccessedAt.getTime() < LAST_ACCESSED_TOUCH_INTERVAL_MS) {
    return setlist;
  }

  try {
    return await prisma.setlist.update({
      where: { id: setlist.id },
      data: { lastAccessedAt: new Date() }
    });
  } catch {
    // Keeping a setlist alive is best-effort; reads must not fail because of it.
    return setlist;
  }
}

export async function findSetlistById(id: string) {
  const setlist = await prisma.setlist.findUnique({ where: { id } });

  if (!setlist) {
    return null;
  }

  return touchLastAccessedAt(setlist);
}

export async function createSetlist(input: SetlistWriteInput) {
  const title = input.title;
  const description = input.description ?? null;
  const songIds = (input.items ?? []).map((item) => item.songId);
  const contentHash = await computeContentHash({ title, description, songIds });

  const existing = await prisma.setlist.findUnique({ where: { contentHash } });
  if (existing) {
    return touchLastAccessedAt(existing);
  }

  try {
    return await prisma.setlist.create({
      data: {
        title,
        description,
        songIds,
        contentHash
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.setlist.findUnique({ where: { contentHash } });
      if (raced) {
        return raced;
      }
    }

    throw error;
  }
}
