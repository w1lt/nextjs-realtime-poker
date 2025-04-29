"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getGame } from "@/lib/poker";

interface ActiveGame {
  gameId: string;
  roomCode: string;
  playerName: string;
  seat: number;
}

export function useActiveGame() {
  const [activeGame, setActiveGame] = useState<ActiveGame | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkActiveGame = async () => {
      const storedGame = localStorage.getItem("activeGame");
      if (storedGame) {
        const gameData = JSON.parse(storedGame);
        try {
          // Verify the game still exists and is active
          const result = await getGame(gameData.gameId);
          if (result.success && result.data) {
            setActiveGame(gameData);
            router.push(`/game/${gameData.roomCode}`);
          } else {
            // Game no longer exists, clear the stored data
            localStorage.removeItem("activeGame");
            setActiveGame(null);
          }
        } catch (error) {
          console.error("Failed to verify active game:", error);
          localStorage.removeItem("activeGame");
          setActiveGame(null);
        }
      }
      setIsChecking(false);
    };

    checkActiveGame();
  }, [router]);

  const setActiveGameData = (data: ActiveGame) => {
    localStorage.setItem("activeGame", JSON.stringify(data));
    setActiveGame(data);
  };

  const clearActiveGame = () => {
    localStorage.removeItem("activeGame");
    setActiveGame(null);
  };

  const redirectToActiveGame = () => {
    if (activeGame) {
      router.push(`/game/${activeGame.roomCode}`);
    }
  };

  return {
    activeGame,
    isChecking,
    setActiveGameData,
    clearActiveGame,
    redirectToActiveGame,
  };
}
