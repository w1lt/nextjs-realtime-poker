"use client";

import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useCallback,
} from "react";
import { toast } from "sonner";

// Replicate the session data structure
interface PlayerSessionData {
  id: string;
  gameId: string;
  roomCode: string;
  name: string;
  seat: number;
  token: string;
}

// Define the shape of the context value
interface PlayerSessionContextType {
  playerSession: PlayerSessionData | null;
  isLoaded: boolean;
  saveSession: (data: PlayerSessionData) => void;
  clearSession: () => void;
  // Removed redirectToGame as it uses useRouter, better kept in component or original hook
}

// Create the context with a default value (can be undefined or throw error if not in provider)
const PlayerSessionContext = createContext<
  PlayerSessionContextType | undefined
>(undefined);

const SESSION_STORAGE_KEY = "poker_player_session";

// Create the Provider component
export const PlayerSessionProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [playerSession, setPlayerSession] = useState<PlayerSessionData | null>(
    null
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Load session from local storage on mount
  useEffect(() => {
    console.log(
      `PlayerSessionProvider: Loading session from key: ${SESSION_STORAGE_KEY}`
    );
    let sessionData = null;
    try {
      sessionData = localStorage.getItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.error(
        "PlayerSessionProvider: Error reading from localStorage:",
        e
      );
      setIsLoaded(true);
      return;
    }

    if (sessionData) {
      try {
        const parsedSession: PlayerSessionData = JSON.parse(sessionData);
        if (
          parsedSession &&
          parsedSession.id &&
          parsedSession.gameId &&
          parsedSession.token
        ) {
          console.log(
            "PlayerSessionProvider: Found valid session data:",
            parsedSession
          );
          setPlayerSession(parsedSession);
        } else {
          console.warn(
            "PlayerSessionProvider: Parsed session data invalid. Removing.",
            parsedSession
          );
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch (e) {
        console.error(
          "PlayerSessionProvider: Failed to parse player session. Removing.",
          e
        );
        try {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        } catch (removeError) {
          console.error(
            "PlayerSessionProvider: Failed to remove invalid item from localStorage:",
            removeError
          );
        }
      }
    } else {
      console.log(
        "PlayerSessionProvider: No player session found in localStorage"
      );
    }
    setIsLoaded(true);
  }, []);

  // Save the complete player session data
  const saveSession = useCallback((data: PlayerSessionData) => {
    console.log(
      "PlayerSessionProvider: Attempting to save player session:",
      data
    );
    if (
      !data ||
      !data.id ||
      !data.gameId ||
      !data.token ||
      !data.name ||
      data.seat == null
    ) {
      console.error("PlayerSessionProvider: Save aborted. Invalid data:", data);
      toast.error("Failed to save session: Incomplete data.");
      return;
    }
    try {
      const stringifiedData = JSON.stringify(data);
      localStorage.setItem(SESSION_STORAGE_KEY, stringifiedData);
      console.log(`PlayerSessionProvider: Saved to localStorage.`);
      const verifyData = localStorage.getItem(SESSION_STORAGE_KEY);
      if (verifyData === stringifiedData) {
        console.log("PlayerSessionProvider: Verification successful.");
        setPlayerSession(data); // Update the shared state
        // Optional: Keep API call for server-side session cookie if needed
        fetch("/api/player/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: data.token }),
        })
          .then((response) =>
            response.ok
              ? console.log(
                  "PlayerSessionProvider: Session cookie set request successful."
                )
              : Promise.reject(response)
          )
          .catch((err) =>
            console.error(
              "PlayerSessionProvider: Failed to set session cookie:",
              err
            )
          );
      } else {
        console.error("PlayerSessionProvider: VERIFICATION FAILED after save!");
        toast.error("Failed to verify session save locally.");
      }
    } catch (e) {
      console.error("PlayerSessionProvider: Error writing to localStorage:", e);
      toast.error("Could not save session locally.");
    }
  }, []); // useCallback ensures function identity stability

  // Clear player session
  const clearSession = useCallback(() => {
    console.log("PlayerSessionProvider: Attempting to clear player session");
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      console.log(`PlayerSessionProvider: Removed item.`);
      const verifyData = localStorage.getItem(SESSION_STORAGE_KEY);
      if (verifyData === null) {
        console.log(
          "PlayerSessionProvider: Verification successful: Item confirmed removed."
        );
        setPlayerSession(null); // Update the shared state
        // Optional: Keep API call to clear server-side session cookie
        fetch("/api/player/session", { method: "DELETE" })
          .then((response) =>
            response.ok
              ? console.log(
                  "PlayerSessionProvider: Session cookie clear request successful."
                )
              : Promise.reject(response)
          )
          .catch((err) =>
            console.error(
              "PlayerSessionProvider: Failed to clear session cookie:",
              err
            )
          );
      } else {
        console.error(
          "PlayerSessionProvider: VERIFICATION FAILED after clear!"
        );
      }
    } catch (e) {
      console.error(
        "PlayerSessionProvider: Error removing item from localStorage:",
        e
      );
    }
  }, []); // useCallback ensures function identity stability

  // Value provided to consumers
  const value = {
    playerSession,
    isLoaded,
    saveSession,
    clearSession,
  };

  return (
    <PlayerSessionContext.Provider value={value}>
      {children}
    </PlayerSessionContext.Provider>
  );
};

// Custom hook to use the PlayerSessionContext
export const usePlayerSessionContext = () => {
  const context = useContext(PlayerSessionContext);
  if (context === undefined) {
    throw new Error(
      "usePlayerSessionContext must be used within a PlayerSessionProvider"
    );
  }
  return context;
};
