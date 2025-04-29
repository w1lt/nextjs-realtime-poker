import { PlayerState, GameSnapshot, Act } from "./types";

/**
 * Game and player position calculation helpers
 */

// Constants
export const MAX_PLAYERS = 10;
export const DEFAULT_STARTING_CHIPS = 1000;
export const DEFAULT_SMALL_BLIND = 5;
export const DEFAULT_BIG_BLIND = 10;

/**
 * Get the next active player seat in clockwise order
 * @param players Array of players
 * @param currentSeat Current seat number or null
 * @returns Next active player's seat number or null if no active players
 */
export function getNextActiveSeat(
  players: PlayerState[],
  currentSeat: number | null
): number | null {
  // Filter active players who haven't folded and aren't sitting out
  const activePlayers = players.filter(
    (p) => p.isActive && !p.hasFolded && !p.isSittingOut
  );

  // Sort players by seat number
  const sortedPlayers = [...activePlayers].sort((a, b) => a.seat - b.seat);

  // If no active players, return null
  if (sortedPlayers.length === 0) {
    return null;
  }

  // If no current seat, start with the first player
  if (currentSeat === null) {
    return sortedPlayers[0].seat;
  }

  // Find the index of the current seat
  const currentIndex = sortedPlayers.findIndex((p) => p.seat === currentSeat);

  // If not found, start with the first player
  if (currentIndex === -1) {
    return sortedPlayers[0].seat;
  }

  // Get the next player in clockwise order
  const nextIndex = (currentIndex + 1) % sortedPlayers.length;
  return sortedPlayers[nextIndex].seat;
}

/**
 * Check if the game is heads-up (only 2 active players)
 * @param players Array of players
 * @returns Boolean indicating if the game is heads-up
 */
export function isHeadsUp(players: PlayerState[]): boolean {
  return players.filter((p) => p.isActive && !p.isSittingOut).length === 2;
}

/**
 * Calculate small blind position based on dealer position
 * @param game Current game snapshot
 * @returns Seat number of the small blind or null
 */
export function getSmallBlindSeat(game: GameSnapshot): number | null {
  if (!game.dealerSeat) return null;

  const activePlayers = game.players.filter(
    (p) => p.isActive && !p.isSittingOut
  );

  // In heads-up, dealer posts small blind
  if (isHeadsUp(game.players)) {
    return game.dealerSeat;
  }

  // Otherwise, small blind is the first active player after dealer
  return getNextActiveSeat(activePlayers, game.dealerSeat);
}

/**
 * Calculate big blind position based on small blind position
 * @param game Current game snapshot
 * @param smallBlindSeat Small blind seat number
 * @returns Seat number of the big blind or null
 */
export function getBigBlindSeat(
  game: GameSnapshot,
  smallBlindSeat: number | null
): number | null {
  if (smallBlindSeat === null) return null;

  const activePlayers = game.players.filter(
    (p) => p.isActive && !p.isSittingOut
  );

  // Big blind is the next active player after small blind
  return getNextActiveSeat(activePlayers, smallBlindSeat);
}

/**
 * Calculate the first player to act based on game phase
 * @param game Current game snapshot
 * @returns Seat number of the first player to act or null
 */
export function getFirstToActSeat(game: GameSnapshot): number | null {
  if (!game.dealerSeat) return null;

  const activePlayers = game.players.filter(
    (p) => p.isActive && !p.isSittingOut
  );

  // If no active players, return null
  if (activePlayers.length === 0) {
    return null;
  }

  const smallBlindSeat = getSmallBlindSeat(game);
  const bigBlindSeat = getBigBlindSeat(game, smallBlindSeat);

  if (game.phase === "PREFLOP") {
    // In preflop, first to act is the player after big blind
    return bigBlindSeat !== null
      ? getNextActiveSeat(activePlayers, bigBlindSeat)
      : getNextActiveSeat(activePlayers, game.dealerSeat);
  } else {
    // In other rounds, first to act is the first active player after dealer
    return getNextActiveSeat(activePlayers, game.dealerSeat);
  }
}

/**
 * Calculate minimum raise amount based on previous bet/raise
 * @param game Current game snapshot
 * @returns Minimum raise amount
 */
export function calculateMinRaise(game: GameSnapshot): number {
  // If no previous raise, minimum is the big blind
  if (game.highestBet === 0) {
    return game.bigBlind;
  }

  // Otherwise, minimum raise is the difference between the last two bets
  // For simplicity, we'll use highest bet minus big blind
  return game.highestBet * 2;
}

/**
 * Generate a random room code (3 letters followed by 3 numbers)
 * @returns Random room code
 */
export function generateRoomCode(): string {
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

/**
 * Check if all active players have acted and bets are settled for the current round.
 * @param game Current game snapshot
 * @returns Boolean indicating if the round is complete
 */
export function isRoundComplete(game: GameSnapshot): boolean {
  // Filter players still in the hand (not folded, not sitting out)
  // We don't filter by p.isActive here, as an all-in player is inactive but still part of the round completion check.
  const activePlayers = game.players.filter(
    (p) => !p.hasFolded && !p.isSittingOut
  );

  // 1. Handle edge case: 0 or 1 active players
  if (activePlayers.length <= 1) {
    // console.log("isRoundComplete: TRUE (<= 1 active player)");
    return true; // Showdown or last player standing
  }

  // 2. Handle pre-deal state (SETUP phase or no actions yet)
  if (!game.lastAction && game.phase !== "PREFLOP") {
    // If not preflop and no actions yet, the "round" isn't really started for betting.
    // This might depend on how initial state is set. Assume not complete if no action.
    // console.log("isRoundComplete: FALSE (Not PREFLOP, no actions yet)");
    return false;
  }

  const highestBet = game.highestBet;
  let lastAggressorSeat: number | null = null;

  // Find the seat of the last player who made an aggressive action (BET or RAISE)
  // Search backwards through actions *of the current hand*
  const sortedActions = [...(game.actions || [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  let lastWinIndex = -1;
  for (let i = sortedActions.length - 1; i >= 0; i--) {
    if (sortedActions[i].type === "WIN") {
      lastWinIndex = i;
      break;
    }
  }
  const currentHandActions = sortedActions.slice(lastWinIndex + 1);

  for (let i = currentHandActions.length - 1; i >= 0; i--) {
    const action = currentHandActions[i];
    if (action.type === Act.BET || action.type === Act.RAISE) {
      const aggressor = game.players.find((p) => p.id === action.playerId);
      if (aggressor) {
        lastAggressorSeat = aggressor.seat;
        break;
      }
    }
  }

  // Preflop special case: If no raise occurred, action ends when it reaches the BB
  const isPreflopNoRaise =
    game.phase === "PREFLOP" &&
    lastAggressorSeat === null &&
    highestBet === game.bigBlind;
  const bigBlindSeat = getBigBlindSeat(game, getSmallBlindSeat(game));

  // Check if all active players have contributed the highest amount
  const allBetsMatch = activePlayers.every((p) => p.currentBet === highestBet);

  // Check if the current turn has reached the player who needs to act last
  let roundShouldEnd = false;

  if (allBetsMatch) {
    // If all bets match, the round ends *unless* it's preflop and the BB hasn't had the option to raise.
    if (isPreflopNoRaise) {
      // In preflop with no raise, the round ends when the turn reaches the BB *after* others called.
      // If the current turn *is* the BB, they still need to act (check or raise).
      roundShouldEnd =
        game.currentTurn === getNextActiveSeat(activePlayers, bigBlindSeat);
    } else if (lastAggressorSeat !== null && highestBet > 0) {
      // If there was a bet/raise THAT ESTABLISHED highestBet > 0,
      // the round ends when the turn gets back to the player *after* the last aggressor.
      roundShouldEnd =
        game.currentTurn ===
        getNextActiveSeat(activePlayers, lastAggressorSeat);
    } else {
      // All bets match, and EITHER no aggressor ever OR highestBet is 0 (check-around post-flop).
      // Round ends when turn returns to the first player to act in the phase.
      const firstToActSeat = getFirstToActSeat(game);
      roundShouldEnd = game.currentTurn === firstToActSeat;
    }
  }

  // console.log("isRoundComplete Check:", {
  //   phase: game.phase,
  //   currentTurn: game.currentTurn,
  //   highestBet,
  //   activePlayerCount: activePlayers.length,
  //   allBetsMatch,
  //   lastAggressorSeat,
  //   isPreflopNoRaise,
  //   bigBlindSeat,
  //   roundShouldEnd,
  // });

  // <<< DETAILED LOGGING BEFORE RETURN >>>
  console.log("[isRoundComplete DEBUG]", {
    phase: game.phase,
    currentTurn: game.currentTurn,
    firstToActSeat: getFirstToActSeat(game), // Recalculate for logging consistency
    lastAggressorSeat,
    highestBet,
    allBetsMatch,
    // activePlayersData: activePlayers.map(p => ({ seat: p.seat, bet: p.currentBet, folded: p.hasFolded, sittingOut: p.isSittingOut, isActive: p.isActive})),
    calculatedResult: roundShouldEnd,
  });

  return roundShouldEnd;
}
