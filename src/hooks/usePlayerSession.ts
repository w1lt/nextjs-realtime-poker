"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Interface now represents the single source of truth for player data/session
interface PlayerSessionData {
  id: string;
  gameId: string;
  roomCode: string;
  name: string;
  seat: number;
  token: string; // Keep token for server-side session verification if needed
}

const SESSION_STORAGE_KEY = "poker_player_session";

export function usePlayerSession() {
  // State holds the complete player data
  const [playerSession, setPlayerSession] = useState<PlayerSessionData | null>(
    null
  );
  const [isLoaded, setIsLoaded] = useState(false);
  const router = useRouter();

  // Load session from local storage on mount
  useEffect(() => {
    console.log(
      `usePlayerSession: Loading session from key: ${SESSION_STORAGE_KEY}`
    );
    let sessionData = null;
    try {
      sessionData = localStorage.getItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.error("usePlayerSession: Error reading from localStorage:", e);
      setIsLoaded(true);
      return;
    }

    if (sessionData) {
      try {
        const parsedSession: PlayerSessionData = JSON.parse(sessionData);
        // Basic validation
        if (
          parsedSession &&
          parsedSession.id &&
          parsedSession.gameId &&
          parsedSession.token
        ) {
          console.log(
            "usePlayerSession: Found valid session data:",
            parsedSession
          );
          setPlayerSession(parsedSession);
        } else {
          console.warn(
            "usePlayerSession: Parsed session data invalid or incomplete. Removing.",
            parsedSession
          );
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch (e) {
        console.error(
          "usePlayerSession: Failed to parse player session. Removing.",
          e
        );
        try {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (removeError) {
          console.error(
            "usePlayerSession: Failed to remove invalid item from localStorage:",
            removeError
          );
        }
      }
    } else {
      console.log("usePlayerSession: No player session found in localStorage");
    }

    setIsLoaded(true);
  }, []);

  // Save the complete player session data
  const saveSession = (data: PlayerSessionData) => {
    console.log("usePlayerSession: Attempting to save player session:", data);

    // Validate required fields before saving
    if (
      !data ||
      !data.id ||
      !data.gameId ||
      !data.token ||
      !data.name ||
      data.seat == null
    ) {
      console.error(
        "usePlayerSession: Save aborted. Invalid/incomplete data provided:",
        data
      );
      toast.error("Failed to save session: Incomplete data.");
      return;
    }

    try {
      const stringifiedData = JSON.stringify(data);
      localStorage.setItem(SESSION_STORAGE_KEY, stringifiedData);
      console.log(
        `usePlayerSession: Saved to localStorage under key '${SESSION_STORAGE_KEY}'.`
      );

      // Verify save
      const verifyData = localStorage.getItem(SESSION_STORAGE_KEY);
      if (verifyData === stringifiedData) {
        console.log("usePlayerSession: Verification successful.");
        // Update state *after* successful save and verification
        setPlayerSession(data);
      } else {
        console.error("usePlayerSession: VERIFICATION FAILED after save!", {
          saved: stringifiedData,
          retrieved: verifyData,
        });
        toast.error("Failed to verify session save locally.");
      }
    } catch (e) {
      console.error("usePlayerSession: Error writing to localStorage:", e);
      toast.error(
        "Could not save session locally. Storage might be full/blocked."
      );
    }

    // Optional: Keep API call if you still need a server-side session cookie
    fetch("/api/player/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: data.token }),
    })
      .then((response) =>
        response.ok
          ? console.log(
              "usePlayerSession: Session cookie set request successful."
            )
          : Promise.reject(response)
      )
      .catch((err) =>
        console.error("usePlayerSession: Failed to set session cookie:", err)
      );
  };

  // Clear player session
  const clearSession = () => {
    console.log("usePlayerSession: Attempting to clear player session");
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      console.log(
        `usePlayerSession: Removed item with key '${SESSION_STORAGE_KEY}'.`
      );

      // Verify removal
      const verifyData = localStorage.getItem(SESSION_STORAGE_KEY);
      if (verifyData === null) {
        console.log(
          "usePlayerSession: Verification successful: Item confirmed removed."
        );
        // Update state *after* successful clear and verification
        setPlayerSession(null);
      } else {
        console.error(
          "usePlayerSession: VERIFICATION FAILED after clear! Item still exists:",
          verifyData
        );
      }
    } catch (e) {
      console.error(
        "usePlayerSession: Error removing item from localStorage:",
        e
      );
    }

    // Optional: Keep API call if you need to clear server-side session cookie
    fetch("/api/player/session", { method: "DELETE" })
      .then((response) =>
        response.ok
          ? console.log(
              "usePlayerSession: Session cookie clear request successful."
            )
          : Promise.reject(response)
      )
      .catch((err) =>
        console.error("usePlayerSession: Failed to clear session cookie:", err)
      );
  };

  // Redirect to active game if session exists
  const redirectToGame = () => {
    if (playerSession) {
      router.push(`/game/${playerSession.roomCode}`);
      return true;
    }
    return false;
  };

  // Return the consolidated session data and functions
  return {
    playerSession, // This now contains { id, gameId, roomCode, name, seat, token }
    isLoaded,
    saveSession,
    clearSession,
    redirectToGame,
  };
}
