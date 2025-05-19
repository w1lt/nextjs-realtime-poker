"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getGameByRoomCode, joinGame, leaveGame } from "@/lib/poker";
import { usePlayerSessionContext } from "@/context/PlayerSessionContext";
import { WaitingRoom } from "@/components/waiting-room";
import { ActiveGame } from "@/components/active-game";
import { GameSummary } from "@/components/game-summary";
import { GameSnapshot } from "@/lib/poker/types";
import { HandSummary } from "@/components/hand-summary";
import { Spinner } from "@/components/ui/spinner";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [isVerifyingSession, setIsVerifyingSession] = useState(false);
  // State to hold the ID of the reconnection toast
  const [reconnectToastId, setReconnectToastId] = useState<
    string | number | null
  >(null);
  const [isLeaving, setIsLeaving] = useState(false);

  const { playerSession, saveSession, clearSession, isLoaded } =
    usePlayerSessionContext();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const roomCode = params.roomCode as string;

  // --- Fetch Game Function Definition --- (Moved outside main useEffect)
  // Define fetchGame using useCallback to stabilize its identity unless dependencies change
  const fetchGame = useCallback(async () => {
    // Removed isMounted check as it's handled differently now
    try {
      console.log("(fetchGame) Fetching game data for room:", roomCode);
      const result = await getGameByRoomCode(roomCode);

      // Check if the component is still mounted using the ref pattern if needed,
      // although state updates on unmounted components are handled by React 18+

      if (result.success && result.data) {
        console.log("(fetchGame) Game data received:", result.data.id);
        setGame(result.data);
      } else {
        console.log("(fetchGame) Game not found result:", result);
        toast.error("Game not found or failed to load"); // More specific error
        router.push("/");
      }
    } catch (error) {
      console.error("(fetchGame) Failed to load game:", error);
      toast.error("Failed to load game");
      router.push("/");
    }
  }, [roomCode, router]); // Add router to dependencies as it's used

  // --- Ref for fetchGame ---
  // Now that fetchGame is defined, we can initialize the ref with it.
  const fetchGameRef = useRef(fetchGame);

  // Update the ref whenever fetchGame changes
  useEffect(() => {
    fetchGameRef.current = fetchGame;
  }, [fetchGame]);

  // First effect - Check if we need to show join dialog based on session state
  useEffect(() => {
    // Wait until both session is loaded and game data is loaded
    if (!isLoaded || !game) return;

    console.log("Checking join dialog status:", {
      hasSession: !!playerSession,
      gameId: game.id,
      gamePlayers: game.players.map((p) => p.id),
    });

    if (playerSession) {
      // We have a session. Assume the player *might* be in the game.
      // Keep the dialog closed unless fetchGame explicitly finds they are not.
      const playerPossiblyInGame = game.players.some(
        (p) => p.id === playerSession.id
      );

      if (playerPossiblyInGame) {
        console.log(
          "Player session exists and player found in current game state. Dialog stays closed."
        );
        setShowJoinDialog(false);
        setPlayerName(playerSession.name);
        setSelectedSeat(playerSession.seat);
      } else {
        // Player has session, but not found in *current* game state.
        // This could be temporary due to state updates.
        // Keep the dialog closed for now. fetchGame will handle clearing if needed.
        console.log(
          "Player session exists but player NOT found in current game state. Waiting for fetchGame confirmation."
        );
        setShowJoinDialog(false); // Keep it closed
      }
    } else {
      // No player session at all.
      console.log("No player session, showing join dialog");
      setShowJoinDialog(true);
    }
  }, [isLoaded, game, playerSession]);

  // Effect to load player name from local storage on mount (client-side only)
  useEffect(() => {
    const storedName = localStorage.getItem("lastPlayerName");
    if (storedName) {
      setPlayerName(storedName);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Second effect - Initial fetch, Supabase setup, and Visibility Handling
  useEffect(() => {
    // Initial data fetch
    fetchGame();

    // --- Visibility Change Listener ---
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("App became visible. Fetching latest game state.");
        fetchGameRef.current(); // Call the latest fetchGame via ref
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // -----------------------------------

    // Set up Supabase realtime subscription - ONLY ONCE
    const setupRealtimeSubscription = () => {
      if (channelRef.current) {
        console.log("setupRealtimeSubscription: Channel already exists.");
        return; // Already set up, don't create another
      }

      try {
        supabase.realtime.connect();
        console.log(
          "setupRealtimeSubscription: Attempting to create channel and subscribe..."
        );

        const channel = supabase
          .channel(`game-${roomCode}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "Player" },
            () => {
              console.log("Realtime: Player change detected");
              fetchGame();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "Game" },
            () => {
              console.log("Realtime: Game change detected");
              fetchGame();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "GameState" },
            () => {
              console.log("Realtime: GameState change detected");
              fetchGame();
            }
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "Action" },
            () => {
              console.log("Realtime: Action change detected");
              fetchGame();
            }
          )
          .subscribe((status, err) => {
            console.log(`Supabase subscription status: ${status}`);
            if (err) {
              console.error("Supabase subscription error:", err);
            }

            if (status === "SUBSCRIBED") {
              console.log(
                "Successfully subscribed! Fetching latest game state."
              );
              if (reconnectToastId) {
                toast.success("Reconnected successfully!", {
                  id: reconnectToastId,
                });
                setReconnectToastId(null);
              }
              fetchGame(); // Use the stable fetchGame
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              console.error(
                `Supabase channel error or timeout: ${status}. Attempting to reconnect...`
              );
              // Show loading toast only if one isn't already active
              if (!reconnectToastId) {
                const newToastId = toast.loading(
                  "Connection issue. Attempting to reconnect..."
                );
                setReconnectToastId(newToastId);
              }

              // Attempt to remove the old channel first
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current).then(() => {
                  console.log("Removed potentially broken channel.");
                });
                channelRef.current = null; // Clear the ref
              }

              // Retry subscription after a delay
              setTimeout(() => {
                console.log("Retrying subscription setup...");
                setupRealtimeSubscription();
              }, 5000); // Retry after 5 seconds
            } else if (status === "CLOSED") {
              console.log("Supabase channel closed.");
              // Optional: Handle explicit closure if needed
            }
          });

        channelRef.current = channel;
        console.log("setupRealtimeSubscription: Channel assigned to ref.");
      } catch (error) {
        console.error("Error setting up realtime subscription:", error);
        // Optional: Implement retry here too if initial setup fails
      }
    };
    setupRealtimeSubscription();

    // Clean up function
    return () => {
      // Remove visibility listener
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Dismiss any active reconnect toast on unmount
      if (reconnectToastId) {
        toast.dismiss(reconnectToastId);
      }
      // Subscription cleanup is handled in the separate unmount effect
    };
    // Use fetchGame in dependency array as it's defined with useCallback
  }, [roomCode, fetchGame, reconnectToastId]);

  // Separate effect for Supabase channel cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        console.log("Cleaning up Supabase subscription");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []); // Empty array ensures this *only* runs on unmount

  // Handle player session updates separately
  useEffect(() => {
    // Wait for game data and session hook readiness
    if (!isLoaded || !game) return;

    if (playerSession) {
      const playerInGame = game.players.some((p) => p.id === playerSession.id);

      if (playerInGame) {
        // Player is confirmed in the game
        console.log("Session check: Player confirmed in game.");
        setPlayerName(playerSession.name);
        setSelectedSeat(playerSession.seat);
        setShowJoinDialog(false);
        if (isVerifyingSession) {
          console.log("Clearing verification flag.");
          setIsVerifyingSession(false); // Clear the flag now
        }
      } else {
        // Player session exists, but player not found in game state
        if (isVerifyingSession) {
          // We just joined, waiting for game state to update. Don't clear yet.
          console.log(
            "Session check: Verifying session, player not yet found in game state. Waiting..."
          );
        } else {
          // Session exists, not verifying, and player not in game. Clear session.
          console.log(
            "Session check: Player session exists but not in game. Clearing session."
          );
          clearSession();
          setShowJoinDialog(true);
        }
      }
    } else {
      // No player session
      console.log("Session check: No player session found.");
      setShowJoinDialog(true);
      if (isVerifyingSession) {
        console.log(
          "Warning: No player session while verifying was true. Clearing flag."
        );
        setIsVerifyingSession(false); // Clear flag if session disappeared during verification
      }
    }
  }, [game, playerSession, isLoaded, clearSession, isVerifyingSession]);

  const handleJoinGame = async () => {
    if (!playerName || selectedSeat === null || !game) {
      toast.error("Please enter your name and select a seat");
      return;
    }

    try {
      setIsJoining(true);
      console.log("Attempting to join game with:", {
        playerName,
        selectedSeat,
      });
      const result = await joinGame(roomCode, playerName, selectedSeat);

      console.log("Join game result:", result);

      if (!result.success) {
        throw new Error(result.message || "Failed to join game");
      }

      // Close the dialog immediately after success
      setShowJoinDialog(false);

      // Check if we got back a session token
      if (result.token && result.data) {
        const player = result.data.players.find(
          (p) => p.name === playerName && p.seat === selectedSeat
        );

        if (!player) {
          console.error(
            "Could not find the joined player in the returned game data!"
          );
          toast.error("Error saving session. Please try rejoining.");
          setIsJoining(false); // Ensure joining state is reset on error
          return;
        }

        const playerId = player.id;
        console.log(
          "Join successful, preparing to save session with playerId:",
          playerId
        );

        const sessionDataToSave = {
          id: playerId,
          gameId: game.id,
          roomCode: roomCode,
          name: playerName,
          seat: selectedSeat,
          token: result.token,
        };

        console.log("Data to be saved in session:", sessionDataToSave);

        // Set verification flag *before* saving session
        setIsVerifyingSession(true);
        // Save the player session (for session persistence across reloads)
        // saveSession now handles all required data
        saveSession(sessionDataToSave);

        // Save player name for prefilling next time
        localStorage.setItem("lastPlayerName", playerName);
      } else {
        console.error(
          "Join successful, but no token or data received in result:",
          result
        );
      }

      toast.success("Joined game successfully");
    } catch (error) {
      console.error("Failed to join game:", error);
      toast.error("Failed to join game");
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveGame = async () => {
    if (!playerSession || !game) return;

    try {
      setIsLeaving(true);
      const result = await leaveGame(game.id, playerSession.id);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Clear player session
      clearSession();
      router.push("/");
    } catch (error) {
      console.error("Failed to leave game:", error);
      toast.error("Failed to leave game");
    } finally {
      setIsLeaving(false);
    }
  };

  if (!game) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Spinner size={48} />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">{game.roomCode}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleLeaveGame}
            disabled={isLeaving}
          >
            {isLeaving ? (
              <>
                <Spinner size={20} className="mr-2" /> Leaving
              </>
            ) : (
              "Leave Game"
            )}
          </Button>

          <Dialog
            open={showJoinDialog}
            onOpenChange={(open) => {
              // Only allow closing via the join button
              if (!open && !playerSession) {
                return; // Prevent closing if not joined
              }
              setShowJoinDialog(open);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join Game</DialogTitle>
                <DialogDescription>
                  Enter your name and select a seat
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  className="w-full p-2 border rounded-md"
                />
                <div className="relative h-60 w-full">
                  {/* Top row - seats 1,2,3 */}
                  <div className="absolute flex justify-center w-full top-0 gap-4">
                    {[1, 2, 3].map((seat) => {
                      const player = game.players.find((p) => p.seat === seat);
                      return (
                        <Button
                          key={seat}
                          variant={
                            selectedSeat === seat ? "default" : "outline"
                          }
                          onClick={() => setSelectedSeat(seat)}
                          disabled={player !== undefined}
                          className="w-12 h-12 rounded-full"
                        >
                          {player ? player.name.charAt(0).toUpperCase() : seat}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Right side - seats 4,5 */}
                  <div className="absolute flex flex-col right-0 top-1/4 h-1/2 justify-around">
                    {[4, 5].map((seat) => {
                      const player = game.players.find((p) => p.seat === seat);
                      return (
                        <Button
                          key={seat}
                          variant={
                            selectedSeat === seat ? "default" : "outline"
                          }
                          onClick={() => setSelectedSeat(seat)}
                          disabled={player !== undefined}
                          className="w-12 h-12 rounded-full"
                        >
                          {player ? player.name.charAt(0).toUpperCase() : seat}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Bottom row - seats 6,7,8 */}
                  <div className="absolute flex justify-center w-full bottom-0 gap-4">
                    {[6, 7, 8].map((seat) => {
                      const player = game.players.find((p) => p.seat === seat);
                      return (
                        <Button
                          key={seat}
                          variant={
                            selectedSeat === seat ? "default" : "outline"
                          }
                          onClick={() => setSelectedSeat(seat)}
                          disabled={player !== undefined}
                          className="w-12 h-12 rounded-full"
                        >
                          {player ? player.name.charAt(0).toUpperCase() : seat}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Left side - seats 9,10 */}
                  <div className="absolute flex flex-col left-0 top-1/4 h-1/2 justify-around">
                    {[9, 10].map((seat) => {
                      const player = game.players.find((p) => p.seat === seat);
                      return (
                        <Button
                          key={seat}
                          variant={
                            selectedSeat === seat ? "default" : "outline"
                          }
                          onClick={() => setSelectedSeat(seat)}
                          disabled={player !== undefined}
                          className="w-12 h-12 rounded-full"
                        >
                          {player ? player.name.charAt(0).toUpperCase() : seat}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Center poker table oval */}
                  <div className="absolute left-1/2 top-1/2 w-3/4 h-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-700/70 flex items-center justify-center">
                    <span className="text-white text-sm">TABLE</span>
                  </div>
                </div>
                <Button
                  onClick={handleJoinGame}
                  disabled={isJoining}
                  className="w-full"
                >
                  {isJoining ? (
                    <>
                      <Spinner size={20} className="mr-2" /> Joining...
                    </>
                  ) : (
                    "Join Game"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Log the current game phase received by the component */}
      {(() => {
        console.log("GamePage rendering with phase:", game.phase);
        return null;
      })()}

      {/* Conditional Rendering based on Game Phase */}
      {game.phase === "GAMEOVER" ? (
        // Render GameSummary when the game phase is GAMEOVER
        <GameSummary
          gameId={game.id}
          players={game.players} // Pass the final player list from the GAMEOVER state
          creatorId={game.creatorId || ""}
          // Determine winner from the final player state (only one should have chips)
          winnerId={game.players.find((p) => p.chipCount > 0)?.id || ""}
        />
      ) : game.phase === "HAND_OVER" ? (
        <HandSummary game={game} />
      ) : // Show WaitingRoom only when game is in SETUP and hasn't started (no dealer assigned)
      game.phase === "SETUP" && game.dealerSeat === null ? (
        <WaitingRoom
          gameId={game.id}
          roomCode={game.roomCode}
          players={game.players}
          creatorId={game.creatorId || ""}
        />
      ) : (
        // Otherwise, render the ActiveGame component
        <>
          {(() => {
            // console.log("Passing game object to ActiveGame:", game);
            return null; // console.log inside JSX should return null or be in an IIFE
          })()}
          <ActiveGame game={game} />
        </>
      )}
    </main>
  );
}
