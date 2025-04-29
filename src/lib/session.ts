"use server";

import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { prisma } from "./prisma";

// Session types
export interface PlayerSession {
  id: string; // Player ID
  gameId: string; // Game ID
  sessionToken: string; // Session token
  createdAt: Date; // Creation timestamp
}

// Encryption helpers (inline to avoid separate module)
const ENCRYPTION_KEY =
  process.env.SESSION_ENCRYPTION_KEY || "a-32-character-string-for-session-key";
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return iv.toString("base64") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const textParts = encryptedText.split(":");
  const iv = Buffer.from(textParts[0], "base64");
  const encryptedData = textParts[1];
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(ENCRYPTION_KEY),
    iv
  );
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Generate a unique session token for a player
 * @param playerId Player ID
 * @param gameId Game ID
 * @returns Session token
 */
export async function createPlayerSession(
  playerId: string,
  gameId: string
): Promise<string> {
  // Generate a unique token
  const token = nanoid(32);

  // Create an encrypted session data
  const sessionData = {
    playerId,
    gameId,
    timestamp: Date.now(),
  };

  // Store session in the database
  await prisma.$transaction(async (tx) => {
    // Check if player exists
    const player = await tx.player.findUnique({
      where: { id: playerId },
    });

    if (!player) {
      throw new Error("Player not found");
    }

    // Create the session
    await prisma.playerSession.create({
      data: {
        id: nanoid(),
        token,
        playerId,
        gameId,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 day expiration
      },
    });
  });

  // Return the encrypted session token
  return encrypt(JSON.stringify(sessionData)) + "." + token;
}

/**
 * Get the current player session from cookies
 * @returns Player session or null if not found
 */
export async function getPlayerSession(): Promise<PlayerSession | null> {
  // Use await with cookies() in Next.js 15
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("player_session");

  if (!sessionCookie) {
    return null;
  }

  const sessionToken = sessionCookie.value;

  try {
    // Split token into encrypted data and verification token
    const [encryptedData, token] = sessionToken.split(".");

    // Decrypt the session data
    const decryptedData = decrypt(encryptedData);
    const sessionData = JSON.parse(decryptedData);

    // Verify the session token against the database
    const dbSession = await prisma.playerSession.findFirst({
      where: {
        playerId: sessionData.playerId,
        gameId: sessionData.gameId,
        token,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!dbSession) {
      return null;
    }

    return {
      id: sessionData.playerId,
      gameId: sessionData.gameId,
      sessionToken: token,
      createdAt: new Date(sessionData.timestamp),
    };
  } catch (error) {
    console.error("Failed to validate session:", error);
    return null;
  }
}

/**
 * Set the player session cookie
 * @param sessionToken Encrypted session token
 */
export async function setPlayerSessionCookie(
  sessionToken: string
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("player_session", sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

/**
 * Clear the player session
 */
export async function clearPlayerSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("player_session");
}

/**
 * Verify a player's identity from their session token
 * @param gameId Game ID
 * @param playerId Player ID
 * @returns Whether the player is authenticated
 */
export async function verifyPlayer(
  gameId: string,
  playerId: string
): Promise<boolean> {
  const session = await getPlayerSession();

  if (!session) {
    return false;
  }

  return session.gameId === gameId && session.id === playerId;
}
