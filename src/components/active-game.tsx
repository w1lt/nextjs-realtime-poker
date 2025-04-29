"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { performPlayerAction, performAction } from "@/lib/poker";
import {
  IconChevronDown,
  IconChevronUp,
  IconClockHour4,
} from "@tabler/icons-react";
import { Act, GameSnapshot, GameActionRecord } from "@/lib/poker/types";

interface ActiveGameProps {
  game: GameSnapshot;
}

export function ActiveGame({ game }: ActiveGameProps) {
  console.log("ActiveGame received game prop:", game);

  const { playerSession } = usePlayerSession();
  const playerData = playerSession;

  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [isGameInfoCollapsed, setIsGameInfoCollapsed] = useState(true);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);

  const currentPlayer = game.players.find((p) => p.seat === game.currentTurn);
  console.log("Current player identified by turn:", currentPlayer);

  const isUserTurn =
    !!playerData &&
    !!currentPlayer &&
    currentPlayer.id === playerData.id &&
    game.currentTurn === playerData.seat;

  console.log("ActiveGame calculated:", {
    isUserTurn,
    hasPlayerData: !!playerData,
    playerDataId: playerData?.id,
    playerDataSeat: playerData?.seat,
    hasCurrentPlayer: !!currentPlayer,
    currentPlayerId: currentPlayer?.id,
    currentPlayerSeat: currentPlayer?.seat,
    currentTurnSeatInGameState: game.currentTurn,
  });

  const userPlayer = playerData
    ? game.players.find((p) => p.id === playerData.id)
    : null;

  const chipDenominations = [5, 10, 25, 100, 500, 1000];

  const getSmallBlindSeat = () => {
    if (game.dealerSeat === null) return null;
    const activePlayers = game.players.filter((p) => !p.isSittingOut);
    if (activePlayers.length <= 1) return null;
    const isHeadsUp = activePlayers.length === 2;
    if (isHeadsUp) {
      return game.dealerSeat;
    }
    const sortedPlayers = [...activePlayers].sort((a, b) => a.seat - b.seat);
    const dealerIndex = sortedPlayers.findIndex(
      (p) => p.seat === game.dealerSeat
    );
    return sortedPlayers[(dealerIndex + 1) % sortedPlayers.length].seat;
  };

  const getBigBlindSeat = () => {
    if (game.dealerSeat === null) return null;
    const activePlayers = game.players.filter((p) => !p.isSittingOut);
    if (activePlayers.length <= 1) return null;
    const isHeadsUp = activePlayers.length === 2;
    if (isHeadsUp) {
      const nonDealerPlayer = activePlayers.find(
        (p) => p.seat !== game.dealerSeat
      );
      return nonDealerPlayer?.seat || null;
    }
    const smallBlindSeat = getSmallBlindSeat();
    if (smallBlindSeat === null) return null;
    const sortedPlayers = [...activePlayers].sort((a, b) => a.seat - b.seat);
    const smallBlindIndex = sortedPlayers.findIndex(
      (p) => p.seat === smallBlindSeat
    );
    return sortedPlayers[(smallBlindIndex + 1) % sortedPlayers.length].seat;
  };

  const smallBlindSeat = getSmallBlindSeat();
  const bigBlindSeat = getBigBlindSeat();

  const isHeadsUp = game.players.filter((p) => !p.isSittingOut).length === 2;

  const isFoldDisabled = () => {
    if (!isUserTurn || isPerformingAction) return true;
    const blindType = needsToPostBlind();
    if (blindType) return true;
    const lastRaiseAction = game.actions?.find(
      (action: GameActionRecord) => action.type === "RAISE"
    );
    if (!lastRaiseAction) return true;
    return false;
  };

  const isCallDisabled = () => {
    if (!isUserTurn || isPerformingAction) return true;

    return false;
  };

  const isRaiseDisabled = () => {
    if (!isUserTurn || isPerformingAction) return true;

    const minimumRaise = game.smallBlind * 2;
    if (userPlayer && userPlayer.chipCount < minimumRaise) return true;

    return false;
  };

  const needsToPostBlind = () => {
    if (!playerData || !game.actions) return false;
    const pendingSmallBlind = game.actions.find(
      (action: GameActionRecord) =>
        action.playerId === playerData.id &&
        action.type === "PENDING_SMALL_BLIND"
    );
    const pendingBigBlind = game.actions.find(
      (action: GameActionRecord) =>
        action.playerId === playerData.id && action.type === "PENDING_BIG_BLIND"
    );
    if (pendingSmallBlind) return "SMALL_BLIND";
    if (pendingBigBlind) return "BIG_BLIND";
    return false;
  };

  const getCallButtonText = () => {
    const blindType = needsToPostBlind();
    if (blindType === "SMALL_BLIND") return `Post SB (${game.smallBlind})`;
    if (blindType === "BIG_BLIND") return `Post BB (${game.bigBlind})`;
    const userInGame = userPlayer;
    const highestBetInRound = game.highestBet ?? 0;
    const userCurrentBet = userInGame?.currentBet ?? 0;
    console.log("getCallButtonText Check:", {
      componentState: "ActiveGame",
      function: "getCallButtonText",
      userId: userInGame?.id,
      userCurrentBet: userCurrentBet,
      highestBetInRound: highestBetInRound,
      isBetToCall: highestBetInRound > 0,
      doesPlayerNeedToCall: userCurrentBet < highestBetInRound,
      result:
        highestBetInRound > 0 && userCurrentBet < highestBetInRound
          ? `Call $${highestBetInRound - userCurrentBet}`
          : "Check",
    });
    if (highestBetInRound > 0 && userCurrentBet < highestBetInRound) {
      const amountToCall = highestBetInRound - userCurrentBet;
      return `Call $${amountToCall}`;
    }
    return "Check";
  };

  const getRaiseButtonText = () => {
    const blindType = needsToPostBlind();
    if (blindType) return "Raise";

    return "Raise";
  };

  const handleFold = async () => {
    if (!isUserTurn || !playerData) return;

    try {
      setIsPerformingAction(true);
      const result = await performPlayerAction(
        game.id,
        playerData.id,
        Act.FOLD
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("You folded");
    } catch (error) {
      console.error("Failed to fold:", error);
      toast.error("Failed to perform action");
    } finally {
      setIsPerformingAction(false);
    }
  };

  const handleCall = async () => {
    if (!isUserTurn || !playerData) return;

    const userInGame = userPlayer;
    const highestBetInRound = game.highestBet ?? 0;
    const userCurrentBet = userInGame?.currentBet ?? 0;
    const isCheckingAction = !(
      highestBetInRound > 0 && userCurrentBet < highestBetInRound
    );

    try {
      setIsPerformingAction(true);

      const blindType = needsToPostBlind();
      if (blindType) {
        const actionType =
          blindType === "SMALL_BLIND" ? Act.SMALL_BLIND : Act.BIG_BLIND;
        const result = await performPlayerAction(
          game.id,
          playerData.id,
          actionType
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        if (blindType === "SMALL_BLIND") {
          toast.success(`You posted the small blind (${game.smallBlind})`);
        } else {
          toast.success(`You posted the big blind (${game.bigBlind})`);
        }
      } else {
        const result = await performPlayerAction(
          game.id,
          playerData.id,
          Act.CALL
        );

        if (!result.success) {
          throw new Error(result.error);
        }

        if (isCheckingAction) {
          toast.success("You checked");
        } else {
          toast.success("You called");
        }
      }
    } catch (error) {
      console.error("Failed to call/check:", error);
      toast.error("Failed to perform action");
    } finally {
      setIsPerformingAction(false);
    }
  };

  const handleRaise = async () => {
    if (!isUserTurn || !playerData || raiseAmount <= 0) return;

    try {
      setIsPerformingAction(true);
      const result = await performPlayerAction(
        game.id,
        playerData.id,
        Act.RAISE,
        raiseAmount
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(`You raised ${raiseAmount}`);
      setShowRaiseModal(false);
      setRaiseAmount(0);
    } catch (error) {
      console.error("Failed to raise:", error);
      toast.error("Failed to perform action");
    } finally {
      setIsPerformingAction(false);
    }
  };

  const addChip = (value: number) => {
    if (!userPlayer) return;

    if (raiseAmount + value <= userPlayer.chipCount) {
      setRaiseAmount(raiseAmount + value);
    } else {
      toast.error("You don't have enough chips");
    }
  };

  useEffect(() => {
    if (!showRaiseModal) {
      setRaiseAmount(0);
    }
  }, [showRaiseModal]);

  const getPhaseDisplay = (phase: string | undefined) => {
    switch (phase) {
      case "SETUP":
        return "Setup (Posting Blinds)";
      case "PREFLOP":
        return "Pre-Flop";
      case "FLOP":
        return "Flop";
      case "TURN":
        return "Turn";
      case "RIVER":
        return "River";
      case "SHOWDOWN":
        return "Showdown";
      default:
        return phase || "UNKNOWN";
    }
  };

  const handleDeclareWinner = async () => {
    if (!selectedWinner || !playerData) return;

    try {
      setIsPerformingAction(true);
      const result = await performAction(game.id, "WIN", 0, selectedWinner);

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success(
        `${
          game.players.find((p) => p.id === selectedWinner)?.name
        } won the pot!`
      );

      setShowWinnerModal(false);
      setSelectedWinner(null);
    } catch (error) {
      console.error("Failed to declare winner:", error);
      toast.error("Failed to declare winner");
    } finally {
      setIsPerformingAction(false);
    }
  };

  const formatActionType = (type: string) => {
    switch (type) {
      case "FOLD":
        return "Folded";
      case "CALL":
        return "Called";
      case "CHECK":
        return "Checked";
      case "RAISE":
        return "Raised";
      case "SMALL_BLIND":
        return "Posted Small Blind";
      case "BIG_BLIND":
        return "Posted Big Blind";
      case "PENDING_SMALL_BLIND":
        return "Needs to post Small Blind";
      case "PENDING_BIG_BLIND":
        return "Needs to post Big Blind";
      case "WIN":
        return "Won the pot";
      default:
        return type;
    }
  };

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const groupActionsByHand = () => {
    if (!game.actions || game.actions.length === 0) return {};
    const grouped: Record<number, GameActionRecord[]> = {};
    const sortedActions = [...game.actions].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    let handNumber = 1;
    sortedActions.forEach((action) => {
      if (!grouped[handNumber]) {
        grouped[handNumber] = [];
      }
      grouped[handNumber].push(action);
      if (action.type === "WIN") {
        handNumber++;
      }
    });
    return grouped;
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <CardHeader
          className="cursor-pointer"
          onClick={() => setIsGameInfoCollapsed(!isGameInfoCollapsed)}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-normal bg-primary/10 text-primary px-2 py-1 rounded-full">
                {getPhaseDisplay(game.phase)}
              </span>
              <span
                className={`text-sm ${
                  game.potSize > 0
                    ? "font-medium text-green-600 dark:text-green-400"
                    : "text-muted-foreground"
                }`}
              >
                Pot: ${game.potSize || 0}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 ">
              {isGameInfoCollapsed ? (
                <IconChevronDown className="h-4 w-4" />
              ) : (
                <IconChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>

        {!isGameInfoCollapsed && (
          <CardContent className="pt-0 pb-3 px-4 ">
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded-md p-3 mb-3">
              <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-1">
                Table Information
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Room Code:</span>
                  <span className="ml-2 font-mono font-medium">
                    {game.roomCode}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Players:</span>
                  <span className="ml-2 font-medium">
                    {game.players.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="flex flex-col">
                <span className="text-muted-foreground">Small Blind</span>
                <span className="font-medium">${game.smallBlind}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground">Big Blind</span>
                <span className="font-medium">${game.bigBlind}</span>
              </div>
            </div>

            {game.potSize > 0 && (
              <div className="bg-green-50 dark:bg-green-950 rounded-md p-3 mb-3">
                <div className="flex justify-between items-center">
                  <span className="text-green-800 dark:text-green-300">
                    Current Pot:
                  </span>
                  <span className="text-lg font-bold text-green-700 dark:text-green-300">
                    ${game.potSize}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 text-xs mb-2">
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded-full bg-blue-500"></div>
                <span>Dealer{isHeadsUp && "/SB"}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded-full bg-amber-500"></div>
                <span>Small Blind{!isHeadsUp && ""}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-4 w-4 rounded-full bg-red-500"></div>
                <span>Big Blind</span>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            {(() => {
              const sortedActions = [...(game.actions || [])].sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime()
              );

              for (let i = sortedActions.length - 1; i >= 0; i--) {
                if (sortedActions[i].type === "WIN") {
                  break;
                }
              }

              return game.players
                .sort((a, b) => a.seat - b.seat)
                .map((player) => {
                  const isDealer = player.seat === game.dealerSeat;
                  const isSmallBlind = player.seat === smallBlindSeat;
                  const isBigBlind = player.seat === bigBlindSeat;
                  const isCurrentTurn = game.currentTurn === player.seat;
                  const isUser = playerData && player.id === playerData.id;

                  const highestBetInRound = game.highestBet || 0;
                  const amountToCall =
                    player.isActive && highestBetInRound > player.currentBet
                      ? highestBetInRound - player.currentBet
                      : 0;

                  return (
                    <div
                      key={player.id}
                      className={`p-3 border rounded-md flex justify-between items-start 
                        ${
                          isCurrentTurn
                            ? "border-primary bg-primary/5"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        }
                        ${!player.isActive ? "opacity-60" : ""}
                        ${isUser ? "border-blue-500 border-opacity-50" : ""}
                        transition-colors`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`mt-0.5 h-8 w-8 min-w-[32px] rounded-full flex items-center justify-center font-bold 
                            ${
                              isDealer
                                ? "bg-blue-500 text-white"
                                : isSmallBlind
                                ? "bg-amber-500 text-white"
                                : isBigBlind
                                ? "bg-red-500 text-white"
                                : "bg-primary text-primary-foreground"
                            }`}
                        >
                          {isHeadsUp
                            ? isDealer
                              ? "D/SB"
                              : "BB"
                            : isDealer
                            ? "D"
                            : isSmallBlind
                            ? "SB"
                            : isBigBlind
                            ? "BB"
                            : player.name.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-grow space-y-1.5">
                          <p className="font-medium flex items-center gap-1.5 flex-wrap">
                            <span>{player.name}</span>
                            {isUser && (
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-2 py-0.5 rounded-full">
                                You
                              </span>
                            )}
                            {!player.isActive && (
                              <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 px-2 py-0.5 rounded-full">
                                Folded
                              </span>
                            )}
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              (${player.chipCount})
                            </span>
                          </p>

                          <div className="text-xs flex flex-col items-start sm:flex-row sm:items-center gap-x-3 gap-y-1 flex-wrap">
                            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-3 w-3"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                {" "}
                                <path
                                  fillRule="evenodd"
                                  d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                  clipRule="evenodd"
                                />{" "}
                              </svg>
                              Wager (Round): ${player.currentBet}
                            </span>
                            {amountToCall > 0 && (
                              <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3 w-3"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  {" "}
                                  <path
                                    fillRule="evenodd"
                                    d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                                    clipRule="evenodd"
                                  />{" "}
                                </svg>
                                To Call: ${amountToCall}
                              </span>
                            )}
                          </div>

                          <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                            {isHeadsUp ? (
                              isDealer ? (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-1.5 py-0.5 rounded-full">
                                  Dealer + Small Blind (${game.smallBlind})
                                </span>
                              ) : (
                                <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 px-1.5 py-0.5 rounded-full">
                                  Big Blind (${game.bigBlind})
                                </span>
                              )
                            ) : (
                              <>
                                {isDealer && (
                                  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-1.5 py-0.5 rounded-full">
                                    Dealer
                                  </span>
                                )}
                                {isSmallBlind && (
                                  <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100 px-1.5 py-0.5 rounded-full">
                                    Small Blind (${game.smallBlind})
                                  </span>
                                )}
                                {isBigBlind && (
                                  <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100 px-1.5 py-0.5 rounded-full">
                                    Big Blind (${game.bigBlind})
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {isCurrentTurn && (
                        <div className="w-3 h-3 min-w-[12px] rounded-full bg-green-500 animate-pulse ml-2 mt-1" />
                      )}
                    </div>
                  );
                });
            })()}
          </div>
        </CardContent>
      </Card>

      {game.phase !== "SHOWDOWN" &&
        game.phase !== "GAMEOVER" &&
        game.phase !== "HAND_OVER" &&
        (() => {
          const activePlayer = game.players.find(
            (p) => p.seat === game.currentTurn
          );
          const waitingMessage = activePlayer
            ? `Waiting for ${activePlayer.name}...`
            : "Waiting for action...";
          return (
            <Card>
              <CardHeader>
                <CardTitle>
                  {isUserTurn ? "Your Turn" : "Game Status"}
                </CardTitle>
                <CardDescription>
                  {isUserTurn ? "Choose your action" : waitingMessage}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 p-3 bg-muted/50 rounded-md border text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your Chips:</span>
                    <span className="font-medium">
                      ${userPlayer?.chipCount ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Wagered (Round):
                    </span>
                    <span className="font-medium">
                      ${userPlayer?.currentBet ?? 0}
                    </span>
                  </div>
                </div>

                {isUserTurn &&
                  (needsToPostBlind() ? (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 gap-2">
                        <Button
                          variant="default"
                          onClick={handleCall}
                          disabled={isPerformingAction}
                        >
                          {needsToPostBlind() === "SMALL_BLIND"
                            ? `Post Small Blind ($${game.smallBlind})`
                            : `Post Big Blind ($${game.bigBlind})`}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={handleFold}
                        disabled={isFoldDisabled()}
                        className="flex-1"
                      >
                        Fold
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCall}
                        disabled={isCallDisabled()}
                        className="flex-1"
                      >
                        {getCallButtonText()}
                      </Button>
                      <Button
                        variant="default"
                        onClick={() => setShowRaiseModal(true)}
                        disabled={isRaiseDisabled()}
                        className="flex-1"
                      >
                        {getRaiseButtonText()}
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          );
        })()}

      <Card className="overflow-hidden">
        <CardHeader
          className="cursor-pointer"
          onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <IconClockHour4 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Action History</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              {isHistoryCollapsed ? (
                <IconChevronDown className="h-4 w-4" />
              ) : (
                <IconChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>

        {!isHistoryCollapsed && (
          <CardContent className="pt-0 pb-3 px-4">
            {game.actions && game.actions.length > 0 ? (
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {Object.entries(groupActionsByHand())
                  .sort(([handA], [handB]) => parseInt(handA) - parseInt(handB))
                  .map(([handNumber, actions]) => (
                    <div key={`hand-${handNumber}`} className="mb-2">
                      <div
                        className={`flex items-center gap-2 mb-1.5 ${
                          parseInt(handNumber) > 1
                            ? "mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
                            : ""
                        }`}
                      >
                        <div className="h-2 w-2 rounded-full bg-primary"></div>
                        <h4 className="text-sm font-medium">
                          Hand {handNumber}
                        </h4>
                      </div>
                      <div className="space-y-1.5 pl-4 border-l border-gray-100 dark:border-gray-800">
                        {[...actions].reverse().map((action) => {
                          const player = game.players.find(
                            (p) => p.id === action.playerId
                          );
                          return (
                            <div
                              key={action.id}
                              className="flex justify-between items-center py-1 border-b border-gray-50 dark:border-gray-900 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <div className="font-medium">
                                  {player?.name || "Unknown"}
                                </div>
                                <div className="text-muted-foreground">
                                  {formatActionType(action.type)}
                                  {action.amount ? ` $${action.amount}` : ""}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatTimestamp(action.createdAt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No actions yet
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {showRaiseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Raise Amount</CardTitle>
              <CardDescription>
                Select chips to add to your raise
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 text-center text-3xl font-bold">
                ${raiseAmount}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {chipDenominations.map((value) => (
                  <Button
                    key={value}
                    variant="outline"
                    onClick={() => addChip(value)}
                    className="h-14"
                  >
                    ${value}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRaiseModal(false);
                    setRaiseAmount(0);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={handleRaise}
                  disabled={raiseAmount <= 0 || isPerformingAction}
                >
                  Raise ${raiseAmount}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {game.phase === "SHOWDOWN" && (
        <Card>
          <CardHeader>
            <CardTitle>Showdown</CardTitle>
            <CardDescription>Declare the winner</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="default"
              onClick={() => setShowWinnerModal(true)}
              className="w-full"
            >
              Declare Winner
            </Button>
          </CardContent>
        </Card>
      )}

      {showWinnerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Declare Winner</CardTitle>
              <CardDescription>
                Select the player who won this hand
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-2 mb-4">
                {game.players
                  .filter((p) => p.isActive)
                  .map((player) => (
                    <Button
                      key={player.id}
                      variant={
                        selectedWinner === player.id ? "default" : "outline"
                      }
                      onClick={() => setSelectedWinner(player.id)}
                      className="justify-start h-auto py-3"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          {player.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{player.name}</span>
                      </div>
                    </Button>
                  ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowWinnerModal(false);
                    setSelectedWinner(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="default"
                  onClick={handleDeclareWinner}
                  disabled={!selectedWinner || isPerformingAction}
                >
                  Confirm Winner
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
