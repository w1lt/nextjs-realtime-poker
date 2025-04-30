"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { toast } from "sonner";
import { createGame, leaveGame } from "@/lib/poker";
import { usePlayerSessionContext } from "@/context/PlayerSessionContext";
import { Spinner } from "@/components/ui/spinner";
import FallingChipsBackground from "@/components/falling-chips-background";

export default function Home() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const { playerSession, isLoaded, clearSession } = usePlayerSessionContext();

  const handleCreateGame = async () => {
    setIsCreating(true);
    try {
      const result = await createGame();
      if (result.success) {
        toast.success(`Game created: ${result.data.roomCode}`);
        router.push(`/game/${result.data.roomCode}`);
      } else {
        toast.error(result.message || "Failed to create game");
      }
    } catch (err) {
      toast.error("An error occurred while creating the game.");
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLeaveAndClear = async () => {
    if (!playerSession) return;
    setIsLeaving(true);
    try {
      const leaveResult = await leaveGame(
        playerSession.gameId,
        playerSession.id
      );
      if (!leaveResult.success && leaveResult.error !== "PLAYER_NOT_FOUND") {
        // Allow leaving even if player not found in DB (might be stale session)
        console.warn("Leave game issue:", leaveResult.message);
        toast.error(`Failed to leave game cleanly: ${leaveResult.message}`);
        // Proceed to clear session anyway
      }
      // Clear local session regardless of DB result (unless specific errors occur)
      clearSession();
      toast.success("Left game and cleared session.");
    } catch (err) {
      toast.error("An error occurred while leaving the game.");
      console.error(err);
      // Optionally clear session even on error?
      // clearSession();
    } finally {
      setIsLeaving(false);
    }
  };

  const renderContent = () => {
    if (!isLoaded) {
      return (
        <CardContent className="flex items-center justify-center p-8">
          <Spinner size={32} />
        </CardContent>
      );
    }

    if (playerSession) {
      return (
        <CardContent className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">
            You are in game:{" "}
            <strong className="text-foreground">
              {playerSession.roomCode}
            </strong>
          </p>
          <Button
            onClick={() => router.push(`/game/${playerSession.roomCode}`)}
            className="w-full"
          >
            Rejoin Game ({playerSession.roomCode})
          </Button>
          <Button
            variant="outline"
            onClick={handleLeaveAndClear}
            disabled={isLeaving}
            className="w-full"
          >
            {isLeaving ? (
              <>
                <Spinner size={20} className="mr-2" /> Leaving...
              </>
            ) : (
              "Leave Game & Clear Session"
            )}
          </Button>
        </CardContent>
      );
    }

    // Default: No active session
    return (
      <CardContent className="flex flex-col gap-4">
        <Button
          onClick={handleCreateGame}
          disabled={isCreating}
          className="w-full"
        >
          {isCreating ? (
            <>
              <Spinner size={20} className="mr-2" /> Creating Game...
            </>
          ) : (
            "Create New Game"
          )}
        </Button>
        <Link href="/join" className="w-full">
          <Button variant="outline" className="w-full">
            Join Game
          </Button>
        </Link>
      </CardContent>
    );
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 gap-6 overflow-hidden">
      <FallingChipsBackground />
      <Image
        src="/images/logo.png"
        alt="Realtime Poker Logo"
        width={150}
        height={150}
        priority
      />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>InstaPoker</CardTitle>
          <CardDescription>
            {playerSession
              ? "Manage your active game session"
              : "Create a new game or join an existing one"}
          </CardDescription>
        </CardHeader>
        {renderContent()}
      </Card>
    </main>
  );
}
