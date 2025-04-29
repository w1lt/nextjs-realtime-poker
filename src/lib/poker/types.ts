import { Player, GamePhase, ActionType } from "@prisma/client";

/**
 * Core types for the poker game state machine
 */

// Reuse GamePhase from Prisma schema
export { GamePhase as Phase };

// Action types - extending on the ActionType from Prisma
export enum Act {
  FOLD = "FOLD",
  CHECK = "CHECK",
  CALL = "CALL",
  BET = "BET", // Distinct from RAISE for semantics
  RAISE = "RAISE",
  SMALL_BLIND = "SMALL_BLIND",
  BIG_BLIND = "BIG_BLIND",
  WIN = "WIN",
  SIT_OUT = "SIT_OUT",
  SIT_IN = "SIT_IN",
}

// Player representation within the game snapshot (extending Prisma's Player)
export interface PlayerState
  extends Omit<Player, "game" | "actions" | "createdGames"> {
  currentBet: number; // How much they've bet in the current round
  hasFolded: boolean; // Whether they've folded in the current hand
  isSittingOut: boolean; // Whether they're sitting out of the current hand
}

// Input action from a player or system
export interface ActionIn {
  type: Act | ActionType;
  playerId?: string; // Optional for some system actions
  amount?: number; // Amount for bets, raises, etc.
  seatNumber?: number; // Used for seat-specific operations
  targetPlayerId?: string; // Used for player-targeted actions like WIN
}

// Complete game state snapshot
export interface GameSnapshot {
  id: string;
  roomCode: string;
  smallBlind: number;
  bigBlind: number;
  phase: GamePhase;
  potSize: number;
  currentTurn: number | null; // Seat number of player to act
  dealerSeat: number | null;
  players: PlayerState[];
  lastAction?: {
    playerId: string;
    type: Act | ActionType;
    amount?: number;
  };
  creatorId?: string; // Player who created the game
  highestBet: number; // Highest bet in the current round
  minRaise: number; // Minimum raise amount
  roundComplete: boolean; // Whether the current betting round is complete
  actions?: GameActionRecord[]; // Add optional actions array
}

// Represents DB-specific metadata for snapshot persistence
export interface GameMetadata {
  gameId: string;
  gameStateId: string;
  updatedAt: Date;
}

// Complete game model as stored in the database
export interface GameModel extends GameSnapshot, GameMetadata {}

// Record of the game's action history
export interface GameActionRecord {
  id: string;
  gameId: string;
  playerId: string;
  type: string;
  amount?: number;
  createdAt: Date;
}

// Error types for game actions
export enum ErrorType {
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  INVALID_ACTION = "INVALID_ACTION",
  INVALID_BET_AMOUNT = "INVALID_BET_AMOUNT",
  NOT_YOUR_TURN = "NOT_YOUR_TURN",
  PLAYER_NOT_FOUND = "PLAYER_NOT_FOUND",
  GAME_NOT_FOUND = "GAME_NOT_FOUND",
  SEAT_TAKEN = "SEAT_TAKEN",
  GAME_FULL = "GAME_FULL",
  DUPLICATE_NAME = "DUPLICATE_NAME",
}

// Possible results from a game action
export type GameActionResult =
  | { success: true; data: GameSnapshot }
  | { success: false; error: string; message: string };
