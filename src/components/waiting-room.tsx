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
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { startGame } from "@/lib/poker";
import { usePlayerSessionContext } from "@/context/PlayerSessionContext";
import { Spinner } from "./ui/spinner";

interface Player {
  id: string;
  name: string;
  seat: number;
}

interface WaitingRoomProps {
  gameId: string;
  roomCode: string;
  players: Player[];
  creatorId: string;
}

export function WaitingRoom({
  gameId,
  roomCode,
  players,
  creatorId,
}: WaitingRoomProps) {
  const [isStarting, setIsStarting] = useState(false);
  const { playerSession } = usePlayerSessionContext();

  // --- Calculate isCreator directly during render ---
  const isCreator = !!playerSession && playerSession.id === creatorId;
  console.log("WaitingRoom Render Check (Context):", {
    playerSessionId: playerSession?.id,
    creatorId,
    calculatedIsCreator: isCreator,
  });
  // ---------------------------------------------------

  const copyInviteLink = () => {
    const inviteLink = `${window.location.origin}/game/${roomCode}`;

    if (!navigator.clipboard) {
      toast.error(
        "Clipboard API not available. Ensure you're using HTTPS or localhost."
      );
      console.error(
        "navigator.clipboard is undefined. Link to copy manually:",
        inviteLink
      );
      // Optionally, show the link in the UI for manual copying
      return;
    }

    navigator.clipboard
      .writeText(inviteLink)
      .then(() => {
        toast.success("Invite link copied to clipboard");
      })
      .catch((err) => {
        toast.error("Failed to copy link.");
        console.error("Could not copy text: ", err);
      });
  };

  const handleStartGame = async () => {
    if (!isCreator) {
      toast.error("Only the game creator can start the game");
      return;
    }

    try {
      setIsStarting(true);
      const result = await startGame(gameId);

      if (!result.success) {
        throw new Error(result.error);
      }
    } catch (error) {
      toast.error("Failed to start game");
      console.error(error);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Waiting for Players</CardTitle>
          <CardDescription>Share this link with other players</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div className="text-2xl font-bold">{roomCode}</div>
            <Button onClick={copyInviteLink} variant="outline">
              Copy Invite Link
            </Button>
            <QRCodeSVG
              value={`${window.location.origin}/game/${roomCode}`}
              size={200}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Players ({players.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            {players.map((player) => (
              <div
                key={player.id}
                className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">
                      {player.name}
                      {player.id === creatorId && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                          Creator
                        </span>
                      )}
                      {playerSession && player.id === playerSession.id && (
                        <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">Seat {player.seat}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-500">Ready</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>
            {isCreator
              ? "You are the game creator"
              : "Waiting for the creator to start the game"}
          </CardDescription>
        </CardHeader>
        {isCreator && (
          <CardContent>
            <Button
              onClick={handleStartGame}
              disabled={players.length < 2 || isStarting}
              className="w-full"
            >
              {isStarting ? (
                <>
                  <Spinner size={20} className="mr-2" /> Starting Game...
                </>
              ) : (
                "Start Game"
              )}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
