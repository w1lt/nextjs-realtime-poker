import { prisma } from "@/lib/prisma";
import { GameSnapshot, Act, GameActionResult } from "./types";
import { GamePhase, ActionType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { DEFAULT_STARTING_CHIPS } from "./helpers";

/**
 * Database layer for the poker game
 * Handles loading and saving game state from/to the database
 */

/**
 * Load a game by ID with all related entities (players, gameState, actions)
 * @param gameId Game ID to load
 * @returns Game snapshot or null if not found
 */
export async function loadGameById(
  gameId: string
): Promise<GameSnapshot | null> {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        gameState: true,
        players: {
          orderBy: { seat: "asc" },
        },
        actions: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!game || !game.gameState) return null;

    // --- Add Logging ---
    console.log(
      `<--- Loading game ${game.id}. GameState phase: ${game.gameState.phase}`
    );
    // -------------------

    // Transform database model to game snapshot
    return {
      id: game.id,
      roomCode: game.roomCode,
      smallBlind: game.smallBlind,
      bigBlind: game.bigBlind,
      phase: game.gameState.phase,
      potSize: game.gameState.potSize,
      currentTurn: game.gameState.currentTurn,
      dealerSeat: game.gameState.dealerSeat,
      players: game.players.map((player) => ({
        ...player,
        currentBet: player.currentBet ?? 0, // Use actual currentBet
        hasFolded: false, // Initialize as not folded
        isSittingOut: !player.isActive, // Map isActive to isSittingOut
      })),
      actions: game.actions.map((action) => ({
        id: action.id,
        gameId: action.gameId,
        playerId: action.playerId,
        type: action.type,
        amount: action.amount ?? undefined,
        createdAt: action.createdAt,
      })),
      lastAction:
        game.actions.length > 0
          ? {
              playerId: game.actions[0].playerId,
              type: game.actions[0].type as Act,
              amount: game.actions[0].amount || undefined,
            }
          : undefined,
      creatorId: game.creatorId || undefined,
      highestBet: game.gameState.highestBet,
      minRaise: game.bigBlind, // Initialize min raise as big blind
      roundComplete: false, // Initialize as not round complete
    };
  } catch (error) {
    console.error("Failed to load game:", error);
    return null;
  }
}

/**
 * Load a game by room code with all related entities
 * @param roomCode Room code to look up
 * @returns Game snapshot or null if not found
 */
export async function loadGameByRoomCode(
  roomCode: string
): Promise<GameSnapshot | null> {
  try {
    const game = await prisma.game.findUnique({
      where: { roomCode },
      include: {
        gameState: true,
        players: {
          orderBy: { seat: "asc" },
        },
        actions: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!game || !game.gameState) return null;

    // Transform database model to game snapshot
    return {
      id: game.id,
      roomCode: game.roomCode,
      smallBlind: game.smallBlind,
      bigBlind: game.bigBlind,
      phase: game.gameState.phase,
      potSize: game.gameState.potSize,
      currentTurn: game.gameState.currentTurn,
      dealerSeat: game.gameState.dealerSeat,
      players: game.players.map((player) => ({
        ...player,
        currentBet: player.currentBet ?? 0, // Use actual currentBet
        hasFolded: false, // Initialize as not folded
        isSittingOut: !player.isActive, // Map isActive to isSittingOut
      })),
      actions: game.actions.map((action) => ({
        id: action.id,
        gameId: action.gameId,
        playerId: action.playerId,
        type: action.type,
        amount: action.amount ?? undefined,
        createdAt: action.createdAt,
      })),
      lastAction:
        game.actions.length > 0
          ? {
              playerId: game.actions[0].playerId,
              type: game.actions[0].type as Act,
              amount: game.actions[0].amount || undefined,
            }
          : undefined,
      creatorId: game.creatorId || undefined,
      highestBet: game.gameState.highestBet,
      minRaise: game.bigBlind, // Initialize min raise as big blind
      roundComplete: false, // Initialize as not round complete
    };
  } catch (error) {
    console.error("Failed to load game by room code:", error);
    return null;
  }
}

/**
 * Save a game snapshot to the database
 * @param snapshot Game snapshot to save
 * @returns Success flag and saved game ID
 */
export async function saveGameState(
  snapshot: GameSnapshot
): Promise<{ success: boolean; gameId: string }> {
  try {
    // Update game, game state, and players atomically
    await prisma.$transaction(async (tx) => {
      // --- Add Logging ---
      console.log(
        `---> Saving game ${snapshot.id} with phase: ${snapshot.phase}`
      );
      // -------------------

      // Update the game (Removed redundant fields)
      await tx.game.update({
        where: { id: snapshot.id },
        data: {
          creatorId: snapshot.creatorId, // Keep creatorId update if needed
          // Ensure other non-removed Game fields are updated if necessary
        },
      });

      // Update the game state
      await tx.gameState.update({
        where: { gameId: snapshot.id },
        data: {
          phase: snapshot.phase,
          potSize: snapshot.potSize,
          currentTurn: snapshot.currentTurn,
          dealerSeat: snapshot.dealerSeat,
          highestBet: snapshot.highestBet,
        },
      });

      // Update all players
      for (const player of snapshot.players) {
        await tx.player.update({
          where: { id: player.id },
          data: {
            chipCount: player.chipCount,
            currentBet: player.currentBet,
            isActive: !player.isSittingOut,
          },
        });
      }

      // Add the last action to the history if it exists
      if (snapshot.lastAction) {
        await tx.action.create({
          data: {
            gameId: snapshot.id,
            playerId: snapshot.lastAction.playerId,
            type: snapshot.lastAction.type as ActionType,
            amount: snapshot.lastAction.amount || null,
            phase: snapshot.phase, // Added phase to action creation
          },
        });
      }
    });

    return { success: true, gameId: snapshot.id };
  } catch (error) {
    console.error("Failed to save game state:", error);
    return { success: false, gameId: snapshot.id };
  }
}

/**
 * Create a specific action record in the database
 * @param gameId Game ID
 * @param playerId Player ID performing the action
 * @param type Type of the action
 * @param amount Optional amount for the action
 * @returns Success flag
 */
export async function createAction(
  gameId: string,
  playerId: string,
  type: ActionType,
  amount?: number
): Promise<{ success: boolean }> {
  try {
    await prisma.action.create({
      data: {
        gameId,
        playerId,
        type,
        amount: amount ?? null,
      },
    });
    return { success: true };
  } catch (error) {
    console.error(
      `Failed to create action ${type} for player ${playerId} in game ${gameId}:`,
      error
    );
    return { success: false };
  }
}

/**
 * Delete pending actions for a specific player and type
 * @param gameId Game ID
 * @param playerId Player ID
 * @param type The type of pending action to delete (e.g., PENDING_SMALL_BLIND)
 * @returns Success flag
 */
export async function deletePendingActions(
  gameId: string,
  playerId: string,
  type: ActionType
): Promise<{ success: boolean }> {
  if (!type.startsWith("PENDING_")) {
    console.warn(`Attempted to delete non-pending action type: ${type}`);
    return { success: false };
  }
  try {
    await prisma.action.deleteMany({
      where: {
        gameId,
        playerId,
        type,
      },
    });
    return { success: true };
  } catch (error) {
    console.error(
      `Failed to delete pending action ${type} for player ${playerId} in game ${gameId}:`,
      error
    );
    return { success: false };
  }
}

/**
 * Create a new game
 * @param roomCode Optional room code (if not provided, one will be generated)
 * @param smallBlind Small blind amount
 * @param bigBlind Big blind amount
 * @returns New game snapshot or error
 */
export async function createGame(
  roomCode?: string,
  smallBlind: number = 5,
  bigBlind: number = 10
): Promise<GameActionResult> {
  try {
    const actualRoomCode = roomCode || generateRoomCode();

    // Check if room code already exists
    const existingGame = await prisma.game.findUnique({
      where: { roomCode: actualRoomCode },
    });

    if (existingGame) {
      return {
        success: false,
        error: "DUPLICATE_ROOM_CODE",
        message: "Room code already exists",
      };
    }

    // Create the game with initial state in a transaction
    const game = await prisma.$transaction(async (tx) => {
      // Create the game
      const newGame = await tx.game.create({
        data: {
          roomCode: actualRoomCode,
          smallBlind,
          bigBlind,
          gameState: {
            create: {
              phase: GamePhase.SETUP,
              potSize: 0,
              currentTurn: null,
              dealerSeat: null,
            },
          },
        },
        include: {
          gameState: true,
        },
      });

      return newGame;
    });

    // Transform to game snapshot
    const snapshot: GameSnapshot = {
      id: game.id,
      roomCode: game.roomCode,
      smallBlind: game.smallBlind,
      bigBlind: game.bigBlind,
      phase: game.gameState!.phase,
      potSize: game.gameState!.potSize,
      currentTurn: game.gameState!.currentTurn,
      dealerSeat: game.gameState!.dealerSeat,
      players: [],
      actions: [],
      highestBet: 0,
      minRaise: game.bigBlind,
      roundComplete: false,
    };

    return { success: true, data: snapshot };
  } catch (error) {
    console.error("Failed to create game:", error);
    return {
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to create game",
    };
  }
}

/**
 * Add a player to a game
 * @param gameId Game ID
 * @param name Player name
 * @param seat Seat number
 * @returns Updated game snapshot or error
 */
export async function addPlayer(
  gameId: string,
  name: string,
  seat: number
): Promise<GameActionResult> {
  try {
    // Check if seat/name is available BEFORE the transaction to fail early
    const existingGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: { players: { select: { seat: true, name: true } } },
    });

    if (!existingGame) {
      return {
        success: false,
        error: "GAME_NOT_FOUND",
        message: "Game not found",
      };
    }

    if (existingGame.players.some((p) => p.seat === seat)) {
      return {
        success: false,
        error: "SEAT_TAKEN",
        message: "Seat is already taken",
      };
    }
    if (
      existingGame.players.some(
        (p) => p.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return {
        success: false,
        error: "DUPLICATE_NAME",
        message: "Name is already taken",
      };
    }

    // Add the player and potentially set creatorId in a transaction
    await prisma.$transaction(async (tx) => {
      // Create the player
      const newPlayer = await tx.player.create({
        data: {
          name,
          seat,
          chipCount: DEFAULT_STARTING_CHIPS,
          isActive: true,
          gameId,
        },
      });

      // Check if creator is already set *within* the transaction
      const game = await tx.game.findUnique({ where: { id: gameId } });
      if (game && game.creatorId === null) {
        await tx.game.update({
          where: { id: gameId },
          data: { creatorId: newPlayer.id },
        });
      }
    });

    // Reload the game state *after* the transaction to return the latest data
    const updatedGameSnapshot = await loadGameById(gameId);
    if (!updatedGameSnapshot) {
      // This should ideally not happen if the transaction succeeded
      console.error("Failed to reload game state after adding player");
      return {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Failed to reload game state",
      };
    }

    return { success: true, data: updatedGameSnapshot };
  } catch (error) {
    // Handle potential unique constraint errors from race conditions if needed
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" // Unique constraint violation
    ) {
      // Check which constraint was violated (if possible, based on meta or message)
      // This is a basic check, more specific error handling might be needed
      const isSeatError = error.message?.includes("'Player_gameId_seat_key'");
      const isNameError = error.message?.includes("'Player_gameId_name_key'");

      let specificError: "SEAT_TAKEN" | "DUPLICATE_NAME" | "CONFLICT" =
        "CONFLICT";
      let specificMessage =
        "Failed to add player due to conflict. Please try again.";

      if (isSeatError) {
        specificError = "SEAT_TAKEN";
        specificMessage = "Seat is already taken. Please choose another.";
      } else if (isNameError) {
        specificError = "DUPLICATE_NAME";
        specificMessage = "Name is already taken. Please choose another.";
      }

      return {
        success: false,
        error: specificError,
        message: specificMessage,
      };
    }
    console.error("Failed to add player:", error);
    return {
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to add player",
    };
  }
}

/**
 * Remove a player from a game
 * @param gameId Game ID
 * @param playerId Player ID to remove
 * @returns Updated game snapshot or error
 */
export async function removePlayer(
  gameId: string,
  playerId: string
): Promise<GameActionResult> {
  try {
    // Load the current game state
    const gameSnapshot = await loadGameById(gameId);
    if (!gameSnapshot) {
      return {
        success: false,
        error: "GAME_NOT_FOUND",
        message: "Game not found",
      };
    }

    // Check if player exists
    const playerIndex = gameSnapshot.players.findIndex(
      (p) => p.id === playerId
    );
    if (playerIndex === -1) {
      return {
        success: false,
        error: "PLAYER_NOT_FOUND",
        message: "Player not found",
      };
    }

    // Remove the player in a transaction
    await prisma.$transaction(async (tx) => {
      // Remove the player
      await tx.player.delete({
        where: {
          id: playerId,
        },
      });

      // If this was the creator, assign a new creator if there are other players
      if (
        gameSnapshot.creatorId === playerId &&
        gameSnapshot.players.length > 1
      ) {
        const nextCreator = gameSnapshot.players.find((p) => p.id !== playerId);
        if (nextCreator) {
          await tx.game.update({
            where: { id: gameId },
            data: {
              creatorId: nextCreator.id,
            },
          });
        }
      }

      // If this was the last player, delete the game
      if (gameSnapshot.players.length === 1) {
        await tx.game.delete({
          where: { id: gameId },
        });
      }
    });

    // Update the game snapshot
    gameSnapshot.players.splice(playerIndex, 1);

    // If this was the creator, assign a new creator
    if (
      gameSnapshot.creatorId === playerId &&
      gameSnapshot.players.length > 0
    ) {
      gameSnapshot.creatorId = gameSnapshot.players[0].id;
    }

    return { success: true, data: gameSnapshot };
  } catch (error) {
    console.error("Failed to remove player:", error);
    return {
      success: false,
      error: "DATABASE_ERROR",
      message: "Failed to remove player",
    };
  }
}

/**
 * Execute a function with database transaction, loading and saving the game state
 * @param gameId Game ID
 * @param fn Function to execute with the game snapshot
 * @returns Result of the function
 */
export async function withGame(
  gameId: string,
  fn: (snapshot: GameSnapshot) => Promise<GameActionResult>
): Promise<GameActionResult> {
  // Load the game
  const gameSnapshot = await loadGameById(gameId);
  if (!gameSnapshot) {
    return {
      success: false,
      error: "GAME_NOT_FOUND",
      message: "Game not found",
    };
  }

  try {
    // Execute the function
    const result = await fn(gameSnapshot);

    // If successful and data is a GameSnapshot, save the updated state
    if (result.success) {
      await saveGameState(result.data);
    }

    return result;
  } catch (error) {
    console.error("Transaction failed:", error);
    return {
      success: false,
      error: "TRANSACTION_FAILED",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Generate a random room code
 * @returns Random room code
 */
function generateRoomCode(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  let code = "";

  // Generate 3 random letters
  for (let i = 0; i < 3; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }

  // Generate 3 random numbers
  for (let i = 0; i < 3; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }

  return code;
}
