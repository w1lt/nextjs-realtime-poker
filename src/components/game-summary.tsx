"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { startGame, resetGame } from "@/lib/poker";
import { toast } from "sonner";

interface Player {
  id: string;
  name: string;
  seat: number;
  chipCount: number;
  isActive: boolean;
}

interface GameSummaryProps {
  gameId: string;
  players: Player[];
  creatorId: string;
  winnerId: string;
}

export function GameSummary({
  gameId,
  players,
  creatorId,
  winnerId,
}: GameSummaryProps) {
  const [isRestarting, setIsRestarting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Find the winner
  const winner = players.find((player) => player.id === winnerId);

  // Sort players by chip count to show ranking
  const sortedPlayers = [...players].sort((a, b) => b.chipCount - a.chipCount);

  const handleRestartGame = async () => {
    try {
      setIsRestarting(true);
      const result = await startGame(gameId);

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Game restarted");
    } catch (error) {
      console.error("Failed to restart game:", error);
      toast.error("Failed to restart game");
    } finally {
      setIsRestarting(false);
    }
  };

  const handleResetToWaitingRoom = async () => {
    try {
      setIsResetting(true);
      const result = await resetGame(gameId);

      if (!result.success) {
        throw new Error(result.error || "Failed to reset game");
      }

      toast.success("Returned to waiting room");
    } catch (error) {
      console.error("Failed to reset game:", error);
      toast.error("Failed to reset game");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Game Over</CardTitle>
          <CardDescription>Hand Complete</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          {winner && (
            <div className="mb-4 text-center">
              <div className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-3xl font-bold mx-auto mb-2">
                {winner.name.charAt(0).toUpperCase()}
              </div>
              <h3 className="text-xl font-bold">{winner.name} Won!</h3>
              <p className="text-muted-foreground">${winner.chipCount} chips</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Final Standings</CardTitle>
          <CardDescription>Player rankings by chip count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`p-3 border rounded-md flex justify-between items-center ${
                  player.id === winnerId ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold bg-muted text-muted-foreground">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">
                      {player.name}
                      {player.id === winnerId && (
                        <span className="ml-2 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 px-2 py-0.5 rounded-full">
                          Winner
                        </span>
                      )}
                      {player.id === creatorId && (
                        <span className="ml-2 text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100 px-2 py-0.5 rounded-full">
                          Creator
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seat {player.seat} ${player.chipCount} chips
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Button
          onClick={handleResetToWaitingRoom}
          disabled={isResetting || isRestarting}
          variant="outline"
          size="lg"
        >
          {isResetting ? "Resetting..." : "Return to Waiting Room"}
        </Button>

        <Button
          onClick={handleRestartGame}
          disabled={isRestarting || isResetting}
          size="lg"
        >
          {isRestarting ? "Restarting..." : "Play Again"}
        </Button>
      </div>
    </div>
  );
}
