import {
  GameSnapshot,
  ActionIn,
  Act,
  PlayerState,
  GameActionResult,
} from "./types";
import {
  getNextActiveSeat,
  getFirstToActSeat,
  getSmallBlindSeat,
  getBigBlindSeat,
  isRoundComplete,
} from "./helpers";

/**
 * Pure state transition logic for the poker game
 * This file has no side effects and no database interactions
 */

/**
 * Main state transition function - apply an action to the current game state
 * @param prevState Previous game state
 * @param action Action to apply
 * @returns New game state or error
 */
export function nextState(
  prevState: GameSnapshot,
  action: ActionIn
): GameActionResult {
  try {
    switch (action.type) {
      case Act.FOLD:
        return handleFold(prevState, action);
      case Act.CHECK:
        return handleCheck(prevState, action);
      case Act.CALL:
        return handleCall(prevState, action);
      case Act.BET:
      case Act.RAISE:
        return handleRaise(prevState, action);
      case Act.SMALL_BLIND:
        return handleSmallBlind(prevState, action);
      case Act.BIG_BLIND:
        return handleBigBlind(prevState, action);
      case Act.WIN:
        return handleWin(prevState, action);
      case Act.SIT_OUT:
        return handleSitOut(prevState, action);
      case Act.SIT_IN:
        return handleSitIn(prevState, action);
      default:
        return {
          success: false,
          error: "INVALID_ACTION",
          message: `Invalid action type: ${action.type}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      error: "GAME_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get the currently active player
 * @param state Current game state
 * @returns Player or undefined if no active player
 */
function getCurrentPlayer(state: GameSnapshot): PlayerState | undefined {
  const currentSeat = state.currentTurn;
  if (currentSeat === null) return undefined;
  return state.players.find((p) => p.seat === currentSeat && p.isActive);
}

/**
 * Validate that it's the player's turn
 * @param state Current game state
 * @param playerId Player ID to validate
 * @returns True if it's the player's turn, false otherwise
 */
function validatePlayerTurn(state: GameSnapshot, playerId?: string): boolean {
  if (!playerId) return false;
  const currentPlayer = getCurrentPlayer(state);
  return currentPlayer?.id === playerId;
}

/**
 * Handle a player folding
 * @param state Current game state
 * @param action Fold action
 * @returns New game state or error
 */
function handleFold(state: GameSnapshot, action: ActionIn): GameActionResult {
  // Add phase check
  if (state.phase === "SHOWDOWN") {
    return {
      success: false,
      error: "INVALID_ACTION_PHASE",
      message: "Cannot fold during Showdown",
    };
  }

  if (!action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID is required for fold action",
    };
  }

  if (!validatePlayerTurn(state, action.playerId)) {
    return {
      success: false,
      error: "NOT_YOUR_TURN",
      message: "It is not your turn to act",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Update player state
  newState.players = state.players.map((player) => {
    if (player.id === action.playerId) {
      return { ...player, hasFolded: true };
    }
    return player;
  });

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: Act.FOLD,
  };

  // Check if there's only one active player left
  const activePlayers = newState.players.filter(
    (p) => p.isActive && !p.hasFolded && !p.isSittingOut
  );

  if (activePlayers.length === 1) {
    // One player left - they win automatically
    return handleAutoWin(newState, activePlayers[0].id);
  }

  // Move to the next player's turn
  const nextSeat = getNextActiveSeat(newState.players, state.currentTurn);
  newState.currentTurn = nextSeat;

  // Check if this completes the betting round
  if (isRoundComplete(newState)) {
    return advanceToNextPhase(newState);
  }

  return { success: true, data: newState };
}

/**
 * Handle a player checking
 * @param state Current game state
 * @param action Check action
 * @returns New game state or error
 */
function handleCheck(state: GameSnapshot, action: ActionIn): GameActionResult {
  // Add phase check
  if (state.phase === "SHOWDOWN") {
    return {
      success: false,
      error: "INVALID_ACTION_PHASE",
      message: "Cannot check during Showdown",
    };
  }

  if (!action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID is required for check action",
    };
  }

  if (!validatePlayerTurn(state, action.playerId)) {
    return {
      success: false,
      error: "NOT_YOUR_TURN",
      message: "It is not your turn to act",
    };
  }

  const currentPlayer = state.players.find((p) => p.id === action.playerId);
  if (!currentPlayer) {
    return {
      success: false,
      error: "PLAYER_NOT_FOUND",
      message: "Player not found",
    };
  }

  // Can only check if no bet has been made or player has already matched the bet
  if (state.highestBet > 0 && currentPlayer.currentBet < state.highestBet) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Cannot check when there is an active bet",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: Act.CHECK,
  };

  // Move to the next player's turn
  const nextSeat = getNextActiveSeat(newState.players, state.currentTurn);
  newState.currentTurn = nextSeat;

  // Check if this completes the betting round
  if (isRoundComplete(newState)) {
    return advanceToNextPhase(newState);
  }

  return { success: true, data: newState };
}

/**
 * Handle a player calling a bet
 * @param state Current game state
 * @param action Call action
 * @returns New game state or error
 */
function handleCall(state: GameSnapshot, action: ActionIn): GameActionResult {
  // Add phase check
  if (state.phase === "SHOWDOWN") {
    return {
      success: false,
      error: "INVALID_ACTION_PHASE",
      message: "Cannot call during Showdown",
    };
  }

  if (!action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID is required for call action",
    };
  }

  if (!validatePlayerTurn(state, action.playerId)) {
    return {
      success: false,
      error: "NOT_YOUR_TURN",
      message: "It is not your turn to act",
    };
  }

  const currentPlayer = state.players.find((p) => p.id === action.playerId);
  if (!currentPlayer) {
    return {
      success: false,
      error: "PLAYER_NOT_FOUND",
      message: "Player not found",
    };
  }

  // Calculate how much more the player needs to call
  const amountToCall = state.highestBet - currentPlayer.currentBet;

  // Check if player has enough chips
  if (currentPlayer.chipCount < amountToCall) {
    return {
      success: false,
      error: "INSUFFICIENT_FUNDS",
      message: "Not enough chips to call",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Update player state - deduct chips and update current bet
  newState.players = state.players.map((player) => {
    if (player.id === action.playerId) {
      return {
        ...player,
        chipCount: player.chipCount - amountToCall,
        currentBet: state.highestBet,
      };
    }
    return player;
  });

  // Update pot size
  newState.potSize += amountToCall;

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: Act.CALL,
    amount: amountToCall,
  };

  // Move to the next player's turn
  const nextSeat = getNextActiveSeat(newState.players, state.currentTurn);
  newState.currentTurn = nextSeat;

  // Check if this completes the betting round
  if (isRoundComplete(newState)) {
    return advanceToNextPhase(newState);
  }

  return { success: true, data: newState };
}

/**
 * Handle a player raising or betting
 * @param state Current game state
 * @param action Raise/Bet action
 * @returns New game state or error
 */
function handleRaise(state: GameSnapshot, action: ActionIn): GameActionResult {
  // Add phase check
  if (state.phase === "SHOWDOWN") {
    return {
      success: false,
      error: "INVALID_ACTION_PHASE",
      message: "Cannot raise during Showdown",
    };
  }

  if (!action.playerId || action.amount === undefined) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID and amount are required for raise/bet action",
    };
  }

  if (!validatePlayerTurn(state, action.playerId)) {
    return {
      success: false,
      error: "NOT_YOUR_TURN",
      message: "It is not your turn to act",
    };
  }

  const currentPlayer = state.players.find((p) => p.id === action.playerId);
  if (!currentPlayer) {
    return {
      success: false,
      error: "PLAYER_NOT_FOUND",
      message: "Player not found",
    };
  }

  // Calculate minimum raise amount
  const minRaise = state.minRaise;

  // Calculate total amount player needs to put in (current bet + raise)
  const totalBetAmount = state.highestBet + minRaise;

  // Check if the raise is valid (at least min raise)
  if (action.amount < totalBetAmount) {
    return {
      success: false,
      error: "INVALID_BET_AMOUNT",
      message: `Raise must be at least ${minRaise} more than current bet`,
    };
  }

  // Check if player has enough chips
  const amountNeeded = action.amount - currentPlayer.currentBet;
  if (currentPlayer.chipCount < amountNeeded) {
    return {
      success: false,
      error: "INSUFFICIENT_FUNDS",
      message: "Not enough chips for this raise",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Update player state - deduct chips and update current bet
  newState.players = state.players.map((player) => {
    if (player.id === action.playerId) {
      return {
        ...player,
        chipCount: player.chipCount - amountNeeded,
        currentBet: action.amount || 0,
      };
    }
    return player;
  });

  // Update pot size and highest bet
  newState.potSize += amountNeeded;
  newState.highestBet = action.amount;

  // Update minimum raise (for next raise)
  newState.minRaise = action.amount - state.highestBet;

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: action.type === Act.BET ? Act.BET : Act.RAISE,
    amount: action.amount,
  };

  // Move to the next player's turn
  const nextSeat = getNextActiveSeat(newState.players, state.currentTurn);
  newState.currentTurn = nextSeat;

  // Check if this completes the betting round
  if (isRoundComplete(newState)) {
    return advanceToNextPhase(newState);
  }

  return { success: true, data: newState };
}

/**
 * Handle a player posting the small blind
 * @param state Current game state
 * @param action Small blind action
 * @returns New game state or error
 */
function handleSmallBlind(
  state: GameSnapshot,
  action: ActionIn
): GameActionResult {
  if (!action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID is required for small blind action",
    };
  }

  const smallBlindSeat = getSmallBlindSeat(state);
  const smallBlindPlayer = state.players.find((p) => p.seat === smallBlindSeat);

  if (!smallBlindPlayer || smallBlindPlayer.id !== action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Only the small blind position can post the small blind",
    };
  }

  // Check if player has enough chips
  if (smallBlindPlayer.chipCount < state.smallBlind) {
    return {
      success: false,
      error: "INSUFFICIENT_FUNDS",
      message: "Not enough chips to post small blind",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Update player state - deduct chips and update current bet
  newState.players = state.players.map((player) => {
    if (player.id === action.playerId) {
      return {
        ...player,
        chipCount: player.chipCount - state.smallBlind,
        currentBet: state.smallBlind,
      };
    }
    return player;
  });

  // Update pot size and highest bet
  newState.potSize += state.smallBlind;
  newState.highestBet = state.smallBlind;

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: Act.SMALL_BLIND,
    amount: state.smallBlind,
  };

  // Advance turn to the Big Blind player
  const bigBlindSeat = getBigBlindSeat(newState, smallBlindSeat);
  if (bigBlindSeat === null) {
    // This shouldn't happen if there are >= 2 active players
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Could not determine Big Blind seat after Small Blind posted.",
    };
  }
  newState.currentTurn = bigBlindSeat;

  return { success: true, data: newState };
}

/**
 * Handle a player posting the big blind
 * @param state Current game state
 * @param action Big blind action
 * @returns New game state or error
 */
function handleBigBlind(
  state: GameSnapshot,
  action: ActionIn
): GameActionResult {
  if (!action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID is required for big blind action",
    };
  }

  const smallBlindSeat = getSmallBlindSeat(state);
  const bigBlindSeat = getBigBlindSeat(state, smallBlindSeat);
  const bigBlindPlayer = state.players.find((p) => p.seat === bigBlindSeat);

  if (!bigBlindPlayer || bigBlindPlayer.id !== action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Only the big blind position can post the big blind",
    };
  }

  // Check if player has enough chips
  if (bigBlindPlayer.chipCount < state.bigBlind) {
    return {
      success: false,
      error: "INSUFFICIENT_FUNDS",
      message: "Not enough chips to post big blind",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Update player state - deduct chips and update current bet
  newState.players = state.players.map((player) => {
    if (player.id === action.playerId) {
      return {
        ...player,
        chipCount: player.chipCount - state.bigBlind,
        currentBet: state.bigBlind,
      };
    }
    return player;
  });

  // Update pot size and highest bet
  newState.potSize += state.bigBlind;
  newState.highestBet = state.bigBlind;

  // Set minimum raise to big blind
  newState.minRaise = state.bigBlind;

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: Act.BIG_BLIND,
    amount: state.bigBlind,
  };

  // Set first player to act
  newState.currentTurn = getFirstToActSeat(newState);

  // If we were in SETUP phase, transition to PREFLOP now
  if (state.phase === "SETUP") {
    newState.phase = "PREFLOP";
  }

  return { success: true, data: newState };
}

/**
 * Handle a player sitting out
 * @param state Current game state
 * @param action Sit out action
 * @returns New game state or error
 */
function handleSitOut(state: GameSnapshot, action: ActionIn): GameActionResult {
  if (!action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID is required for sit out action",
    };
  }

  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) {
    return {
      success: false,
      error: "PLAYER_NOT_FOUND",
      message: "Player not found",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Update player state
  newState.players = state.players.map((p) => {
    if (p.id === action.playerId) {
      return { ...p, isSittingOut: true };
    }
    return p;
  });

  // If it was this player's turn, move to the next player
  if (player.seat === state.currentTurn) {
    newState.currentTurn = getNextActiveSeat(
      newState.players,
      state.currentTurn
    );
  }

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: Act.SIT_OUT,
  };

  return { success: true, data: newState };
}

/**
 * Handle a player sitting back in
 * @param state Current game state
 * @param action Sit in action
 * @returns New game state or error
 */
function handleSitIn(state: GameSnapshot, action: ActionIn): GameActionResult {
  if (!action.playerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Player ID is required for sit in action",
    };
  }

  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) {
    return {
      success: false,
      error: "PLAYER_NOT_FOUND",
      message: "Player not found",
    };
  }

  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Update player state
  newState.players = state.players.map((p) => {
    if (p.id === action.playerId) {
      return { ...p, isSittingOut: false };
    }
    return p;
  });

  // Record last action
  newState.lastAction = {
    playerId: action.playerId,
    type: Act.SIT_IN,
  };

  return { success: true, data: newState };
}

/**
 * Handle a player winning the pot
 * @param state Current game state
 * @param action Win action
 * @returns New game state or error
 */
function handleWin(state: GameSnapshot, action: ActionIn): GameActionResult {
  if (!action.targetPlayerId) {
    return {
      success: false,
      error: "INVALID_ACTION",
      message: "Target player ID is required for win action",
    };
  }

  const winningPlayer = state.players.find(
    (p) => p.id === action.targetPlayerId
  );
  if (!winningPlayer) {
    return {
      success: false,
      error: "PLAYER_NOT_FOUND",
      message: "Winning player not found",
    };
  }

  // Create a new state to avoid mutating the original
  const tempState = { ...state };

  // Award pot to the winning player
  tempState.players = state.players.map((p) => {
    if (p.id === action.targetPlayerId) {
      return {
        ...p,
        chipCount: p.chipCount + state.potSize,
      };
    }
    return p;
  });

  // Reset pot
  tempState.potSize = 0;

  // Record last action (using the awarded pot size before reset)
  tempState.lastAction = {
    playerId: action.playerId || action.targetPlayerId,
    type: Act.WIN,
    amount: state.potSize,
  };

  // --- Detailed Logging Before Check ---
  console.log(`<<< handleWin Check for Game Over >>>`);
  console.log(
    `State BEFORE awarding pot:`,
    state.players.map((p) => ({ id: p.id, chips: p.chipCount }))
  );
  console.log(`Pot Size Awarded: ${state.potSize}`);
  console.log(`Winner ID: ${action.targetPlayerId}`);
  console.log(
    `State AFTER awarding pot (in tempState):`,
    tempState.players.map((p) => ({ id: p.id, chips: p.chipCount }))
  );
  // -------------------------------------

  // --- Game Over Check ---
  const playersWithChips = tempState.players.filter((p) => p.chipCount > 0);
  console.log(
    `Players with chips (>0): ${playersWithChips.length}`,
    playersWithChips.map((p) => ({ id: p.id, chips: p.chipCount }))
  ); // Log count, IDs and chips

  if (playersWithChips.length <= 1) {
    // Game is over!
    const finalState: GameSnapshot = {
      ...tempState,
      phase: "GAMEOVER", // Set phase to GAMEOVER
      currentTurn: null, // No more turns
      dealerSeat: null, // No dealer needed
      highestBet: 0,
      minRaise: 0,
      roundComplete: true,
      // lastAction is already set
    };
    console.log(
      "*** Game Over condition met. Returning finalState:",
      finalState
    );
    return { success: true, data: finalState };
  } else {
    // Game continues, transition to HAND_OVER phase
    console.log(
      `!!! Game Over check FAILED (playersWithChips > 1). Transitioning to HAND_OVER.`
    ); // Log transition
    // return resetForNextHand(tempState); // REMOVED reset call
    const handOverState: GameSnapshot = {
      ...tempState,
      phase: "HAND_OVER",
      currentTurn: null, // No current turn during summary
      highestBet: 0, // Reset for display consistency
      minRaise: state.bigBlind, // Reset for next hand consistency
      roundComplete: true,
      // lastAction already contains winner and pot info
    };
    return { success: true, data: handOverState };
  }
}

/**
 * Handle a player automatically winning when all others fold
 * @param state Current game state
 * @param winningPlayerId ID of winning player
 * @returns New game state or error
 */
function handleAutoWin(
  state: GameSnapshot,
  winningPlayerId: string
): GameActionResult {
  return handleWin(state, {
    type: Act.WIN,
    targetPlayerId: winningPlayerId,
  });
}

/**
 * Resets the game state for the next hand, advances dealer button,
 * determines new blind positions, and sets the first player to act (SB).
 * Does NOT apply the blinds directly.
 * @param state Previous game state
 * @returns New game state ready for the next hand or error
 */
export function resetForNextHand(state: GameSnapshot): GameActionResult {
  // 1. Advance Dealer Button
  const activePlayers = state.players.filter(
    (p) => p.isActive && !p.isSittingOut // Consider only players who didn't sit out last hand
  );
  if (activePlayers.length < 2) {
    // Not enough players to continue
    // Consider adding logic here to end the game or wait
    return {
      success: false,
      error: "NOT_ENOUGH_PLAYERS",
      message: "Not enough active players to start a new hand.",
    };
  }
  const newDealerSeat = getNextActiveSeat(activePlayers, state.dealerSeat);
  if (newDealerSeat === null) {
    // Should theoretically not happen if activePlayers.length >= 2
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Could not determine next dealer.",
    };
  }

  // 2. Reset Player States for New Hand
  const resetPlayers = state.players.map((p) => ({
    ...p,
    currentBet: 0,
    hasFolded: false,
    // Keep isSittingOut status
    // Reset chip counts for players who busted?
    // For now, assume players with 0 chips are handled elsewhere or sit out
    chipCount: p.chipCount <= 0 ? 0 : p.chipCount, // Ensure no negative chips
    isActive: p.chipCount > 0 && !p.isSittingOut, // Re-evaluate isActive based on chips
  }));

  // 3. Create temporary snapshot to calculate blinds based on new dealer
  const tempStateForBlinds: GameSnapshot = {
    ...state,
    dealerSeat: newDealerSeat,
    players: resetPlayers, // Use reset players for blind calculation
  };

  // 4. Determine Blinds (using the *new* dealer position)
  const sbSeat = getSmallBlindSeat(tempStateForBlinds);
  const bbSeat = getBigBlindSeat(tempStateForBlinds, sbSeat);

  if (sbSeat === null || bbSeat === null) {
    // This might happen if only one player becomes active after reset
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Could not determine blind positions for the new hand.",
    };
  }

  // 5. Determine First Player to Act (Small Blind posts first)
  const firstToAct = sbSeat;

  // 6. Assemble Final State for New Hand (without applying blinds)
  const newState: GameSnapshot = {
    ...state,
    players: resetPlayers,
    dealerSeat: newDealerSeat,
    potSize: 0, // Reset pot
    currentTurn: firstToAct,
    highestBet: 0, // Reset highest bet
    minRaise: state.bigBlind, // Reset min raise to BB
    phase: "SETUP", // Start in SETUP phase
    roundComplete: false,
    lastAction: undefined, // Clear last action
    // We are not modifying chip counts or pot size here
  };

  return { success: true, data: newState };
}

/**
 * Advance the game to the next phase (PREFLOP -> FLOP -> TURN -> RIVER -> SHOWDOWN)
 * @param state Current game state
 * @returns New game state for the next phase
 */
function advanceToNextPhase(state: GameSnapshot): GameActionResult {
  // Create a new state to avoid mutating the original
  const newState = { ...state };

  // Determine the next phase
  switch (state.phase) {
    case "PREFLOP":
      newState.phase = "FLOP";
      break;
    case "FLOP":
      newState.phase = "TURN";
      break;
    case "TURN":
      newState.phase = "RIVER";
      break;
    case "RIVER":
      newState.phase = "SHOWDOWN";
      break;
    case "SHOWDOWN":
      // After showdown, the WIN action should have already been processed
      // handleWin determines if it's GAMEOVER or resets for the next hand.
      // We should not automatically reset here, as the game might be over.
      // return resetForNextHand(state); // REMOVED
      // Instead, just return the current state; the WIN action handles the next step.
      return { success: true, data: state };
    default:
      return {
        success: false,
        error: "INVALID_PHASE",
        message: `Invalid phase: ${state.phase}`,
      };
  }

  // Reset betting for the new round
  newState.highestBet = 0;
  newState.minRaise = newState.bigBlind;

  // Reset player bets for the new round
  newState.players = newState.players.map((p) => ({
    ...p,
    currentBet: 0,
  }));

  // Set the first player to act in the new phase
  newState.currentTurn = getFirstToActSeat(newState);

  return { success: true, data: newState };
}
