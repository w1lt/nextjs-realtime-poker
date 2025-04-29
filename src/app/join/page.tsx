"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { getGameByRoomCode } from "@/lib/poker";

export default function JoinGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      setRoomCode(code.toUpperCase());
    }
  }, [searchParams]);

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roomCode) {
      toast.error("Please enter a room code");
      return;
    }

    try {
      setIsJoining(true);
      const result = await getGameByRoomCode(roomCode);

      if (result.success) {
        router.push(`/game/${roomCode}`);
      } else {
        toast.error(result.message || "Game not found");
      }
    } catch (err) {
      toast.error("Failed to join game");
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join Game</CardTitle>
          <CardDescription>
            Enter the room code to join an existing game
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinGame} className="flex flex-col gap-4">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter room code (e.g., ABC123)"
              className="w-full p-2 border rounded-md"
              maxLength={6}
            />
            <Button type="submit" disabled={isJoining} className="w-full">
              {isJoining ? "Joining..." : "Join Game"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
