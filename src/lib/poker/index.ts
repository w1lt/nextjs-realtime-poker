"use server";
import {
  createGame as dbCreateGame,
  loadGameById,
  loadGameByRoomCode,
  addPlayer as dbAddPlayer,
  removePlayer as dbRemovePlayer,
  createAction,
  deletePendingActions,
  withGame,
} from "./db";
import { nextState, resetForNextHand } from "./engine";
import {
  GameSnapshot,
  ActionIn,
  Act,
  GameActionResult,
  PlayerState,
} from "./types";
import { getSmallBlindSeat, getBigBlindSeat } from "./helpers";
import { nanoid } from "nanoid";
import { ActionType } from "@prisma/client";

/**
 * Controller layer for the poker game
 * This file exports the public API for the poker game
 */

// Simple encrypt function for player tokens
function generateToken(playerId: string, gameId: string): string {
  const data = {
    playerId,
    gameId,
    timestamp: Date.now(),
    nonce: nanoid(8),
  };
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

/**
 * Create a new game
 * @param roomCode Optional room code
 * @param smallBlind Optional small blind amount
 * @param bigBlind Optional big blind amount
 * @returns New game or error
 */
export async function createGame(
  roomCode?: string,
  smallBlind?: number,
  bigBlind?: number
): Promise<GameActionResult> {
  try {
    const result = await dbCreateGame(roomCode, smallBlind, bigBlind);
    return result;
  } catch (error) {
    console.error("Failed to create game:", error);
    return {
      success: false,
      error: "GAME_ERROR",
      message: "Failed to create game",
    };
  }
}

/**
 * Join a game with a room code
 * @param roomCode Room code to join
 * @param name Player name
 * @param seat Seat number
 * @returns Game snapshot or error
 */
export async function joinGame(
  roomCode: string,
  name: string,
  seat: number
): Promise<GameActionResult & { token?: string }> {
  try {
    console.log(`Joining game ${roomCode} as ${name} in seat ${seat}`);

    // Find the game by room code
    const game = await loadGameByRoomCode(roomCode);
    if (!game) {
      console.error("Game not found when joining:", roomCode);
      return {
        success: false,
        error: "GAME_NOT_FOUND",
        message: "Game not found",
      };
    }

    console.log(`Found game with ID ${game.id}`);

    // Add player to the game
    const result = await dbAddPlayer(game.id, name, seat);
    if (result.success && result.data) {
      // Generate a session token for the player
      const player = result.data.players.find(
        (p) => p.name === name && p.seat === seat
      );

      if (player) {
        const playerId = player.id;
        console.log(`Player added successfully with ID: ${playerId}`);

        const token = generateToken(playerId, game.id);
        console.log(`Generated token for player: ${token.substring(0, 20)}...`);

        // Return success with token and player info
        return {
          ...result,
          token,
        };
      } else {
        console.error("Player not found in response after adding");
      }
    } else {
      console.error(
        "Failed to add player:",
        result.success ? "Unknown error" : result.message
      );
    }
    return result;
  } catch (error) {
    console.error("Failed to join game:", error);
    return {
      success: false,
      error: "GAME_ERROR",
      message: "Failed to join game",
    };
  }
}

/**
 * Leave a game
 * @param gameId Game ID
 * @param playerId Player ID
 * @returns Success or error
 */
export async function leaveGame(
  gameId: string,
  playerId: string
): Promise<GameActionResult> {
  try {
    const result = await dbRemovePlayer(gameId, playerId);
    return result;
  } catch (error) {
    console.error("Failed to leave game:", error);
    return {
      success: false,
      error: "GAME_ERROR",
      message: "Failed to leave game",
    };
  }
}

/**
 * Starts the very first hand of the game.
 * Sets initial dealer, calls engine to reset for hand, creates pending blind actions,
 * and saves the initial state.
 * @param gameId Game ID
 * @returns Updated game state or error
 */
export async function startGame(gameId: string): Promise<GameActionResult> {
  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    // Check if we have enough players
    const activePlayersList = snapshot.players.filter(
      (p) => p.isActive && !p.isSittingOut
    );
    if (activePlayersList.length < 2) {
      return {
        success: false,
        error: "NOT_ENOUGH_PLAYERS",
        message: "Need at least 2 active players to start",
      };
    }

    // Prevent starting if already started (dealer is set)
    if (snapshot.dealerSeat !== null) {
      return {
        success: false,
        error: "GAME_ALREADY_STARTED",
        message: "Game has already started",
      };
    }

    // 1. Set the first player as dealer for the very first hand
    const initialDealerSeat = activePlayersList[0].seat;
    const snapshotWithDealer: GameSnapshot = {
      ...snapshot,
      dealerSeat: initialDealerSeat,
    };

    // 2. Call engine to reset state for the first hand
    const handResetResult = resetForNextHand(snapshotWithDealer);
    if (!handResetResult.success) {
      return handResetResult; // Propagate error
    }
    const initialHandState = handResetResult.data;

    // 3. Determine SB/BB players based on the reset state
    const sbPlayer = initialHandState.players.find(
      (p: PlayerState) => p.seat === getSmallBlindSeat(initialHandState)
    );
    const bbPlayer = initialHandState.players.find(
      (p: PlayerState) =>
        p.seat === getBigBlindSeat(initialHandState, sbPlayer?.seat ?? null)
    );

    if (!sbPlayer || !bbPlayer) {
      return {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Could not identify blind players for initial hand.",
      };
    }

    // 4. Create Pending Blind Actions in DB
    const sbPendingAction = await createAction(
      gameId,
      sbPlayer.id,
      ActionType.PENDING_SMALL_BLIND,
      snapshot.smallBlind
    );
    const bbPendingAction = await createAction(
      gameId,
      bbPlayer.id,
      ActionType.PENDING_BIG_BLIND,
      snapshot.bigBlind
    );

    if (!sbPendingAction.success || !bbPendingAction.success) {
      return {
        success: false,
        error: "DB_ERROR",
        message: "Failed to create pending blind actions.",
      };
    }

    // 5. Return the initial hand state (to be saved by withGame)
    return { success: true, data: initialHandState };
  });
}

/**
 * Starts the next hand after one concludes.
 * Calls engine to reset state, creates pending blind actions, and saves state.
 * @param gameId Game ID
 * @returns Updated game state or error
 */
export async function startNextHand(gameId: string): Promise<GameActionResult> {
  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    // 1. Call engine to reset state for the next hand
    const handResetResult = resetForNextHand(snapshot);
    if (!handResetResult.success) {
      return handResetResult; // Propagate error
    }
    const nextHandState = handResetResult.data;

    // 2. Determine SB/BB players based on the reset state
    const sbPlayer = nextHandState.players.find(
      (p: PlayerState) => p.seat === getSmallBlindSeat(nextHandState)
    );
    const bbPlayer = nextHandState.players.find(
      (p: PlayerState) =>
        p.seat === getBigBlindSeat(nextHandState, sbPlayer?.seat ?? null)
    );

    if (!sbPlayer || !bbPlayer) {
      return {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Could not identify blind players for next hand.",
      };
    }

    // 3. Create Pending Blind Actions in DB
    const sbPendingAction = await createAction(
      gameId,
      sbPlayer.id,
      ActionType.PENDING_SMALL_BLIND,
      snapshot.smallBlind
    );
    const bbPendingAction = await createAction(
      gameId,
      bbPlayer.id,
      ActionType.PENDING_BIG_BLIND,
      snapshot.bigBlind
    );

    if (!sbPendingAction.success || !bbPendingAction.success) {
      return {
        success: false,
        error: "DB_ERROR",
        message: "Failed to create pending blind actions for next hand.",
      };
    }

    // 4. Return the next hand state (to be saved by withGame)
    return { success: true, data: nextHandState };
  });
}

/**
 * Post small blind
 * @param gameId Game ID
 * @param playerId Player ID
 * @returns Updated game state or error
 */
export async function postSmallBlind(
  gameId: string,
  playerId: string
): Promise<GameActionResult> {
  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    try {
      // Create action for posting small blind
      const action: ActionIn = {
        type: Act.SMALL_BLIND,
        playerId,
      };

      // Apply the action to the game state
      const result = nextState(snapshot, action);

      return result;
    } catch (error) {
      console.error("Failed to post small blind:", error);
      return {
        success: false,
        error: "GAME_ERROR",
        message: "Failed to post small blind",
      };
    }
  });
}

/**
 * Post big blind
 * @param gameId Game ID
 * @param playerId Player ID
 * @returns Updated game state or error
 */
export async function postBigBlind(
  gameId: string,
  playerId: string
): Promise<GameActionResult> {
  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    try {
      // Create action for posting big blind
      const action: ActionIn = {
        type: Act.BIG_BLIND,
        playerId,
      };

      // Apply the action to the game state
      const result = nextState(snapshot, action);

      return result;
    } catch (error) {
      console.error("Failed to post big blind:", error);
      return {
        success: false,
        error: "GAME_ERROR",
        message: "Failed to post big blind",
      };
    }
  });
}

/**
 * Compatibility function to handle old-style action calls
 * @param gameId Game ID
 * @param actionType Action type as string
 * @param amount Amount for bet/raise
 * @param winnerId Winner player ID for WIN actions
 * @returns Updated game state or error
 */
export async function performAction(
  gameId: string,
  actionType: string,
  amount: number = 0,
  winnerId?: string
): Promise<GameActionResult> {
  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    try {
      // Map old action types to new action types
      let action: ActionIn;

      if (actionType === "WIN" && winnerId) {
        action = {
          type: Act.WIN,
          targetPlayerId: winnerId,
        };
      } else {
        // For other actions like FOLD, CHECK, CALL, RAISE
        // We need the current player's ID
        const currentPlayer = snapshot.players.find(
          (p) => p.seat === snapshot.currentTurn
        );

        if (!currentPlayer) {
          return {
            success: false,
            error: "PLAYER_NOT_FOUND",
            message: "Current player not found",
          };
        }

        action = {
          type: actionType as Act,
          playerId: currentPlayer.id,
          amount: amount > 0 ? amount : undefined,
        };
      }

      // Apply the action to the game state
      const result = nextState(snapshot, action);

      return result;
    } catch (error) {
      console.error("Failed to perform action:", error);
      return {
        success: false,
        error: "GAME_ERROR",
        message: "Failed to perform action",
      };
    }
  });
}

// Rename original performAction to avoid conflict
/**
 * Perform a game action (check, call, bet, raise, fold)
 * @param gameId Game ID
 * @param playerId Player ID
 * @param actionType Action type
 * @param amount Amount for bet/raise
 * @returns Updated game state or error
 */
export async function performPlayerAction(
  gameId: string,
  playerId: string,
  actionType: Act,
  amount?: number
): Promise<GameActionResult> {
  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    try {
      // Create action object
      const action: ActionIn = {
        type: actionType,
        playerId,
        amount,
      };

      // Apply the action to the game state
      const result = nextState(snapshot, action);

      // Action-specific side-effects (like deleting pending actions)
      let pendingActionDeleted = true; // Assume success unless deletion fails
      if (actionType === Act.SMALL_BLIND) {
        const deleteResult = await deletePendingActions(
          gameId,
          playerId,
          ActionType.PENDING_SMALL_BLIND
        );
        pendingActionDeleted = deleteResult.success;
      } else if (actionType === Act.BIG_BLIND) {
        const deleteResult = await deletePendingActions(
          gameId,
          playerId,
          ActionType.PENDING_BIG_BLIND
        );
        pendingActionDeleted = deleteResult.success;
      }

      if (!pendingActionDeleted) {
        return {
          success: false,
          error: "DB_ERROR",
          message: "Failed to remove corresponding pending action.",
        };
      }

      return result;
    } catch (error) {
      console.error("Failed to perform action:", error);
      return {
        success: false,
        error: "GAME_ERROR",
        message: "Failed to perform action",
      };
    }
  });
}

/**
 * Award the pot to a specific player (used for showdown)
 * @param gameId Game ID
 * @param winnerId Winner player ID
 * @returns Updated game state or error
 */
export async function awardPot(
  gameId: string,
  winnerId: string
): Promise<GameActionResult> {
  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    const winAction: ActionIn = { type: Act.WIN, targetPlayerId: winnerId };
    const engineResult = nextState(snapshot, winAction);

    if (!engineResult.success) {
      return engineResult;
    }

    // After successfully processing the win in the engine (which should call resetForNextHand),
    // we need to trigger the setup for the *next* hand (create pending actions).
    // However, `nextState` for WIN already returns the reset state via resetForNextHand.
    // We need to call startNextHand AFTER this transaction completes and state is saved.

    // TODO: Refactor this. The win logic should ideally save the winning state,
    // then separately trigger the startNextHand logic.
    // For now, we return the state after win processing (which includes the reset state).
    // The caller (likely client-side after SHOWDOWN) needs to trigger startNextHand.

    return engineResult; // This state already reflects the reset for the next hand
  });
}

/**
 * Reset the game to start a new hand
 * @param gameId Game ID
 * @returns Updated game state or error
 */
export async function resetGame(gameId: string): Promise<GameActionResult> {
  const game = await loadGameById(gameId);
  if (!game) {
    return {
      success: false,
      error: "GAME_NOT_FOUND",
      message: "Game not found",
    };
  }

  return await withGame(gameId, async (snapshot: GameSnapshot) => {
    try {
      // Create a new snapshot with reset state
      const resetSnapshot: GameSnapshot = {
        ...snapshot,
        phase: "PREFLOP",
        potSize: 0,
        currentTurn: null,
        dealerSeat: null, // Explicitly reset dealer seat for waiting room state
        highestBet: 0,
        minRaise: snapshot.bigBlind,
        roundComplete: false,
        players: snapshot.players.map((player) => ({
          ...player,
          currentBet: 0,
          hasFolded: false,
        })),
        lastAction: undefined, // Clear last action
      };

      // Remove dealer button movement logic if resetting to pure waiting state
      /*
      if (
        resetSnapshot.dealerSeat !== null && // This condition would now always be false
        resetSnapshot.players.length > 0
      ) {
        // Find the next seat after the current dealer
        const activePlayers = resetSnapshot.players.filter(
          (p) => !p.isSittingOut
        );
        if (activePlayers.length > 0) {
          const currentDealerIndex = activePlayers.findIndex(
            (p) => p.seat === resetSnapshot.dealerSeat
          );
          const nextDealerIndex =
            (currentDealerIndex + 1) % activePlayers.length;
          resetSnapshot.dealerSeat = activePlayers[nextDealerIndex].seat;
        }
      }
      */

      return { success: true, data: resetSnapshot };
    } catch (error) {
      console.error("Failed to reset game:", error);
      return {
        success: false,
        error: "GAME_ERROR",
        message: "Failed to reset game",
      };
    }
  });
}

/**
 * Get a game by ID
 * @param gameId Game ID
 * @returns Game snapshot or error
 */
export async function getGame(gameId: string): Promise<GameActionResult> {
  try {
    const game = await loadGameById(gameId);
    if (!game) {
      return {
        success: false,
        error: "GAME_NOT_FOUND",
        message: "Game not found",
      };
    }
    return { success: true, data: game };
  } catch (error) {
    console.error("Failed to get game:", error);
    return {
      success: false,
      error: "GAME_ERROR",
      message: "Failed to get game",
    };
  }
}

/**
 * Get a game by room code
 * @param roomCode Room code
 * @returns Game snapshot or error
 */
export async function getGameByRoomCode(
  roomCode: string
): Promise<GameActionResult> {
  try {
    const game = await loadGameByRoomCode(roomCode);
    if (!game) {
      return {
        success: false,
        error: "GAME_NOT_FOUND",
        message: "Game not found",
      };
    }
    return { success: true, data: game };
  } catch (error) {
    console.error("Failed to get game by room code:", error);
    return {
      success: false,
      error: "GAME_ERROR",
      message: "Failed to get game",
    };
  }
}

/**
 * Simple wrapper action to be called by the client after a hand concludes
 * to trigger the setup for the next hand.
 * @param gameId Game ID
 * @returns Result of startNextHand
 */
export async function triggerNextHand(
  gameId: string
): Promise<GameActionResult> {
  console.log(`Triggering next hand for game: ${gameId}`);
  // Simply call the existing function that handles the logic
  const result = await startNextHand(gameId);
  if (result.success) {
    console.log(`Next hand triggered successfully for game: ${gameId}`);
  } else {
    console.error(
      `Failed to trigger next hand for game ${gameId}:`,
      result.message
    );
  }
  return result;
}
