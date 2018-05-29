// holochess.js v@VERSION
// https://github.com/ddd-mtl/holochess/
//
// Copyright (c) 2018, Damien Douté


// start anonymous scope
;(function () {
'use strict';

// CONSTANTS
var startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// GAME STATES
var GAME_STATE_NULL              = 1 << 0;
var GAME_STATE_EMPTY             = 1 << 1;
var GAME_STATE_SANDBOX           = 1 << 2;
var GAME_STATE_CHALLENGE_VIEWING = 1 << 3;
var GAME_STATE_CHALLENGE_PLAYING = 1 << 4;

// Html Elements
var turnColorEl      = $('#turn-color');
var boardStatusEl    = $('#board-status');
var myHandleEl       = $('#my-handle');
var boardEl          = $('#myBoard');
var logEl            = $('#logtable');
var GameTitleEl      = $('#active-game');
var myGamesUl        = $('#my-games');
var squareClass      = '.square-55d63';

// Game panel stateful variables
var gameState = GAME_STATE_NULL;
var squareToHighlight;
var hasProposedMove;
var lastValidMove;
var lastSubmittedMove;
var canWhitePlay;
var lastSubmittedFen;
var canUndoMove;
var mustSubmitOnHolochain; // true if game state required submission
var canSubmit;             // can this player submit a move
var loadedGame;
var moveCount;
var myTurn;
var challengeeHandle;
var cachedSanMoves;

// APP Stateful variables
var activeOpponentHash  = null;
var activeChallengeHash = null;
var myGames = new Object();         // Cache of all my Games
var cachedHandles;   // Cache of all known Handles on the holochain DHT


// ========================================================================
// Helpers
// ========================================================================

/**
 * Clear chessboard highlights
 */
var removeHighlights = function(color)
{
  //console.log(boardEl.find(squareClass));
  boardEl.find(squareClass).removeClass('highlight-' + color);
};


/**
 * Compare array of objects
 */
var isEqual = function (value, other)
{
	// Get the value type
    let type = Object.prototype.toString.call(value);

	// If the two objects are not the same type, return false
  if (type !== Object.prototype.toString.call(other))
  {
    return false;
  }

	// If items are not an object or array, return false
  if (['[object Array]', '[object Object]'].indexOf(type) < 0)
  {
    return false;
  }

	// Compare the length of the length of the two items
    let valueLen = type === '[object Array]' ? value.length : Object.keys(value).length;
    let otherLen = type === '[object Array]' ? other.length : Object.keys(other).length;
  if (valueLen !== otherLen)
  {
    return false;
  }

	// Compare two items
  var compare = function(item1, item2)
  {
		// Get the object type
      let itemType = Object.prototype.toString.call(item1);

		// If an object or array, compare recursively
    if (['[object Array]', '[object Object]'].indexOf(itemType) >= 0)
    {
      if (!isEqual(item1, item2))
      {
        return false;
      }
		}
		// Otherwise, do a simple comparison
    else
    {
			// If the two items are not the same type, return false
      if (itemType !== Object.prototype.toString.call(item2))
      {
        return false;
      }

			// Else if it's a function, convert to a string and compare
			// Otherwise, just compare
      if (itemType === '[object Function]')
      {
				if (item1.toString() !== item2.toString()) return false;
			} else {
				if (item1 !== item2) return false;
			}
		}
	};

	// Compare properties
  if (type === '[object Array]')
  {
    for (let i = 0; i < valueLen; i++)
    {
			if (compare(value[i], other[i]) === false) return false;
		}
	} else {
    for (let key in value)
    {
			if (value.hasOwnProperty(key)) {
				if (compare(value[key], other[key]) === false) return false;
			}
		}
	}
	// If nothing failed, return true
	return true;
};


// ========================================================================
// Chessboard callbacks
// ========================================================================

/**
 * only pick up pieces if game not over and for the side to move
 */
var board_onDragStart = function(source, piece, position, orientation)
{
  if (gameEngine.game_over() === true
      // || (game.turn() === 'w' && piece.search(/^b/) !== -1)
      // || (game.turn() === 'b' && piece.search(/^w/) !== -1)
      // || (game.turn() === 'w' && !canWhitePlay)
      // || (game.turn() === 'b' && canWhitePlay)
      )
  {
      return false;
  }
};


/**
 * Process move on drop
 * @param {string} source coordinate
 * @param {string} target coordinate
 */
var board_onDrop = function(source, target)
{

  // Revert displacement if wrong color is played
  const sourcePiece = gameEngine.get(source);
  if(sourcePiece !== null
      && (sourcePiece.color === 'b' && canWhitePlay === true
          || sourcePiece.color === 'w' && canWhitePlay !== true)
  )
  {
    return 'snapback';
  }

  // create Move
    let moveOrder =
  {
    from:       source,
    to:         target,
    promotion:  'q'     // FIXME: always promoting to Queen
  };

  const turnColor   = gameEngine.turn();
  squareToHighlight = moveOrder.to;

  // try move
  let move = gameEngine.move(moveOrder);

  // check if move order was illegal
  // and try from moved piece's previous position
  if (move === null)
  {
    // can't try if it's the first move
    if(canUndoMove === false)
    {
      return 'snapback';
    }
    // can't try if last move is same color
    if(sourcePiece !== null && sourcePiece.color === turnColor)
    {
      return 'snapback';
    }

    // try undoing previous move and doing new move (different piece)
    let undoneMove = gameEngine.undo();
    move           = gameEngine.move(moveOrder);
    if(move === null)
    {
      // there was no previous move
      if(undoneMove === null)
      {
        return 'snapback';
      }

      // previous move must be same piece
      const isSamePiece = (undoneMove !== null && undoneMove.to === moveOrder.from);
      if(!isSamePiece)
      {
        lastValidMove = gameEngine.move(undoneMove);
        return 'snapback';
      }

      // try from previous move's "from" position
      const moveOrderAlt =
      {
        from:       undoneMove.from,
        to:         target,
        promotion:  'q' // FIXME: always promoting to Queen
      };

      console.log('Alt: ' + moveOrderAlt.from + '-' + moveOrderAlt.to);
      move = gameEngine.move(moveOrderAlt);
      if (move === null)
      {
        // Maybe failed because trying to put piece back to origin
        if (moveOrderAlt.from !== moveOrderAlt.to)
        {
          lastValidMove = gameEngine.move(undoneMove);
          return 'snapback';
        }
      }
    }
  }

  // Move was valid update Game Panel state
  // ======================================

  canUndoMove   = true;
  lastValidMove = move;

  const fen = gameEngine.fen();
  $('#submit-button').prop("disabled", true);
  if(lastSubmittedFen !== fen)
  {
    if(mustSubmitOnHolochain && canSubmit)
    {
      $('#submit-button').prop("disabled", false);
    }
  }
  else
  {
    canUndoMove = false;
  }
  $('#undo-button').prop("disabled", !canUndoMove);

  // highlight move
  const highlightColor = (canWhitePlay? 'w' : 'b');
  removeHighlights(highlightColor);
  console.log(moveOrder.from +'-' + moveOrder.to + ' | ' + highlightColor);
  boardEl.find('.square-' + source).addClass('highlight-' + highlightColor);
  boardEl.find('.square-' + target).addClass('highlight-' + highlightColor);

  updateGameStatusLabel();

  if(!mustSubmitOnHolochain)
  {
    submitMove();
  }
};


/**
 * update board display
 * Done after the piece snap because of castling, en passant and pawn promotion
 */
var board_onSnapEnd = function()
{
  console.log("board_onSnapEnd: " + gameEngine.fen());
  board.position(gameEngine.fen());
  board_onMoveEnd();
};


/**
 * Highlight squares
 */
var board_onMoveEnd = function()
{
  // console.log(squareToHighlight + ' into ' + (canWhitePlay? 'w' : 'b') + ' || '+ '.square-' + squareToHighlight);
  boardEl.find('.square-' + squareToHighlight).addClass('highlight-' + canWhitePlay? 'w' : 'b');
};


/**
 *
 */
var removeGreySquares = function()
{
  $('#myBoard .square-55d63').css('background', '');
};


/**
 *
 * @param {String} square (coordinate)
 */
var greySquare = function(square)
{
  let squareEl = $('#myBoard .square-' + square);
  let background = '#a9a9a9';
  if (squareEl.hasClass('black-3c85d') === true)
  {
      background = '#696969';
  }
  squareEl.css('background', background);
};



/**
 * Apply grey filter On hovered square
 * @param {*} square
 * @param {*} piece
 */
var board_onMouseoverSquare = function(square, piece)
{
  // get list of possible moves for this square
  // var moves = game.moves(
  // {
  //   square: square,
  //   verbose: true
  // });

  // // exit if there are no moves available for this square
  // if (moves.length === 0)
  // {
  //     return;
  // }

  // highlight the square they moused over
  greySquare(square);

  // // highlight the possible squares for this piece
  // for (var i = 0; i < moves.length; i++)
  // {
  //   greySquare(moves[i].to);
  // }
};


/**
 *
 */
var board_onMouseoutSquare = function(square, piece)
{
  removeGreySquares();
};


// ========================================================================
// Buttons Behavior
// ========================================================================

/**
 * SANDBOX BUTTON = Set Game state to GAME_STATE_SANDBOX
 */
$('#sandbox-button').on('click', function()
{
  // First set state GAME_STATE_EMPTY
  resetGamePanel();

  // Setup sandbox
  gameState             = GAME_STATE_SANDBOX;
  mustSubmitOnHolochain = false;
  canWhitePlay          = true;
  lastSubmittedFen      = startingFen;

  board.start();
  updateGameStatusLabel();
  updateTurnColorLabel();
  challengeeHandle = '';
  GameTitleEl.html("sandbox");
  $('#reset-button').prop("disabled", false);

});


/**
 * RESET BUTTON
 *    Set Game state to GAME_STATE_EMPTY
 */
$('#reset-button').on('click', function()
{
  resetGamePanel();
  setSelectedGame(null);
});


/**
 *
 * @param {*} challengeHash
 */
var loadGame = function(challengeHash, isPrivate)
{
  // if no input, reload current game
  if(!challengeHash || challengeHash === undefined || typeof challengeHash !== "string")
  {
    challengeHash = g_loadedChallengeHash;
  }
  if(isPrivate === undefined)
  {
    isPrivate = g_myGames[challengeHash].isPrivate;
  }

  // console.log("loadGame(" + challengeHash + ") | " + g_loadedChallengeHash);
  // First get all Moves from Holochain
  return hcpGetMoves(challengeHash, isPrivate).then(
          function(sanMoves)
          {
            // console.log("loadGame() sanMoves = " + sanMoves);
            // Don't do anything if no new move
            if(sanMoves && cachedSanMoves && sanMoves === cachedSanMoves)
            {
              // console.log("loadGame() NO NEW MOVE");
              return;
            }

            // Change sanMoves string to array of strings
            var sanArray = [];
            if(sanMoves !== "")
            {
              var sanArray = sanMoves.split(',');
            }
            // console.log("loadGame() sanArray = " + JSON.stringify(sanArray));

            // Rebuild Game Panel
            // ==================
            // First reset game state
            resetGamePanel();

            gameState      = GAME_STATE_CHALLENGE_VIEWING;
            cachedSanMoves = sanMoves;
            canWhitePlay   = true;

            // Get Game
            // console.log("loadGame() ");
            loadedGame = g_myGames[g_loadedChallengeHash]; // FIXME Game might not be ready to display
            // if(loadedGame === undefined)
            // {
            //   // FIXME: debug this
            //   console.log("Game not loaded: " + g_loadedChallengeHash);
            //   return;
            // }

            // Go through all the moves
            for(let i = 0; i < sanArray.length; i++)
            {
              // console.log("\t" + i + ". " + sanArray[i]);
              let move = gameEngine.move(sanArray[i]);
              if(move === null)
              {
                alert("invalid move:" + sanArray[i]);
                break;
              }
              // undo-redo to get last Move object
              let moveObj = gameEngine.undo();
              gameEngine.move(moveObj);
              updateGame(moveObj);
            }
            board_onSnapEnd();

            // Set board orientation
            if(!loadedGame.iPlayWhite)
            {
              // console.log("\t\tBOARD FLIP");
              board.orientation('black');
            }

            // Update stateful variables
            myTurn = (loadedGame.iPlayWhite && canWhitePlay ||
                      !loadedGame.iPlayWhite && !canWhitePlay);
            canSubmit = myTurn;

            // Update Html
            challengeeHandle = (loadedGame.iAmChallenger? loadedGame.challengeeHandle : loadedGame.challengerHandle);
            GameTitleEl.html(loadedGame.name);
            $('#reset-button').prop("disabled", false);
            updateGameStatusLabel();
            updateTurnColorLabel();

            setSelectedGame(challengeHash);
          });
};


/**
 * UNDO BUTTON
 */
$('#undo-button').on('click', function()
{
  if(!canUndoMove)
  {
    return;
  }
  gameEngine.undo();
  lastSubmittedFen = gameEngine.fen();
  $('#submit-button').prop("disabled", true);
  $('#undo-button').prop("disabled", true);
  lastSubmittedMove = null;
  canUndoMove = false;
  board_onSnapEnd();
});


/**
 *
 */
var submitMove = function()
{
  canUndoMove       = false;
  lastSubmittedMove = lastValidMove;

  lastSubmittedFen = gameEngine.fen();
  $('#submit-button').prop("disabled", true);
  $('#undo-button').prop("disabled", true);

  // undo-redo to get last Move object
  const lastMove = gameEngine.undo();
  const lastSan  = lastMove.san;
  gameEngine.move(lastMove);
  console.log("Submit Move: " + lastSubmittedMove + " | " + lastSan);

  // Update Game after HCP completes
  let movePromise = mustSubmitOnHolochain?
                      hcpCommitMove(g_loadedChallengeHash, lastSan, moveCount, loadedGame.isPrivate)
                    : Promise.resolve();
  movePromise.then(
    function(hash)
    {
      updateGame(lastMove);
      updateTurnColorLabel();
      myTurn = false;
      if(mustSubmitOnHolochain)
      {
        updateLoadedGame();
      }
    });
};


/**
 * SUBMIT BUTTON
 */
$('#submit-button').on('click', submitMove);


/**
 * CHALLENGE BUTTON
 *    Submit Challenge Entry
 *    update my Games list
 *    load newly created Game
 */
$("#challenge-button").on("click", function()
{
  hcpCommitChallenge(activeOpponentHash).then(
    function(challengeHash)
    {

      setSelectedPlayer(null);
      pmsRefreshMyGamesUl().then(
        function(/* std */)
        {
          loadGame(challengeHash, false);
        });
    });
});


/**
 * PRIVATE CHALLENGE BUTTON
 *    Submit Challenge Entry if possible
 *    update my Games list
 *    load newly created Game
 */
$("#private-challenge-button").on("click", function()
{
  hcpCommitPrivateChallenge(activeOpponentHash).then(
    function(challengeHash)
    {
      setSelectedPlayer(null);
      pmsRefreshMyGamesUl().then(
        function(/* std */)
        {
          loadGame(challengeHash, true);
        });
    });
});

/**
 * Update Player-Handles list
 */
var getAllHandles = function()
{
  hcpGetAllHandles().then(
    function(allHandlesArg)
    {
      updateOpponentList(allHandlesArg);
    });
};


/**
 * Update Games list
 */
var pmsRefreshMyGamesUl = function()
{
  return hcpGetMyGames().then(
          function()
          {
            return hcpGetMyPrivateGames().then(
              function()
              {
                buildMyGamesUl(g_myGames);
              }
            );
          }
          ).catch(
              function(err)
              {
                console.log("hcpGetMyGames failed: " + err);
              });
};


/**
 * Set selected player from Opponents list
 * @param {hash} agentHash hash of agent to select
 * can be null to deselect current selection
 */
var setSelectedPlayer = function(agentHash)
{
  activeOpponentHash = agentHash;
  $("#players li").removeClass("selection");
  if(activeOpponentHash)
  {
    let elem = $("#players li[data-id=" + activeOpponentHash + "]");
    $(elem).addClass("selection");
  }
  $('#challenge-button').prop("disabled", activeOpponentHash == null);
  $('#private-challenge-button').prop("disabled", activeOpponentHash == null);
};


/**
 *  Select clicked handle
 */
$("#players").on("click", "li", function()
{
  setSelectedPlayer($(this).data('id'));
});


/**
 * Set selected Game from MyGames list
 * @param {hash} challengeHash hash of challenge to select
 * can be null to deselect current selection
 */
var setSelectedGame = function(challengeHash)
{
  activeChallengeHash = challengeHash;
  $('#my-games li').removeClass("selection");
  if(activeChallengeHash)
  {
    let elem = $("#my-games li[data-id=" + activeChallengeHash + "]");
    $(elem).addClass("selection");
  }
};


/**
 * Select clicked Game name
 */
$("#my-games").on("click", "li", function()
{
  cachedSanMoves = "";
  loadGame($(this).data('id'));
});


//===============================================================================
// Opponent List
// ==============================================================================

/**
 *
 * @param {Array} allHandles (Array of handle_links)
 */
var updateOpponentList = function(allHandles)
{
  // Don't update if nothing has changed
  if(isEqual(cachedHandles, allHandles))
  {
    return;
  }
  cachedHandles = allHandles;
  $("#players").empty();
  for (let x = 0; x < allHandles.length; x++)
  {
    // Don't put myself in the list
    if(allHandles[x].Hash === g_myHash)
    {
      continue;
    }
    $("#players").append(makePlayerLi(allHandles[x]));
  }
  // Re-select active opponent
  if(activeOpponentHash)
  {
    setSelectedPlayer(activeOpponentHash);
  }
};


/**
 * return html string of Player handle for an UL
 * @param {Object} handleLink
 */
var makePlayerLi = function(handleLink)
{
  return  "<li data-id=\"" + handleLink.Hash + "\""
        + "data-name=\"" + handleLink.Entry + "\">"
        + handleLink.Entry
        + "</li>";
};


//===============================================================================
// GAMES / CHALLENGES
// ==============================================================================

/**
 *
 */
var updateTurnColorLabel = function()
{
  let turnText = '';
  if(gameState === GAME_STATE_SANDBOX)
  {
    turnText = (canWhitePlay? 'White turn' : "Black turn");
  }
  else
  {
    if(myTurn !== null)
    {
      turnText = (myTurn? 'My turn' : challengeeHandle + "'s turn");
    }
  }
  turnColorEl.html(turnText);
};


/**
 *  Tell user game state
 */
var updateGameStatusLabel = function()
{
  let status = '';

  // Get turn color
  let moveColor = 'White';
  if (gameEngine.turn() === 'b')
  {
    moveColor = 'Black';
  }

  // checkmate?
  if (gameEngine.in_checkmate() === true)
  {
    status = 'Game over, ' + moveColor + ' is in checkmate.';
  }
  // draw?
  else if (gameEngine.in_draw() === true)
  {
    status = 'Game over, drawn position';
  }
  // game still on
  else
  {
    // check?
    if (gameEngine.in_check() === true)
    {
      status += moveColor + ' is in check';
    }
  }

  boardStatusEl.html(status);
  // fenEl.html(game.fen());
  // pgnEl.html(game.pgn());
};


/**
 * Update Game state with new move
 * @param {Object} newMove
 */
var updateGame = function(newMove)
{
  moveCount++;
  canWhitePlay = !canWhitePlay;
  canSubmit = !canSubmit;

  const fullMoveCount = Math.floor(moveCount / 2);

  // Update log UI
  let moveLogItem = "<td>" + newMove.from +'-' + newMove.to + "</td>";
  if(gameEngine.turn() === 'b') // if current turn is black, that means white has played
  {
    logEl.append("<tr class=\"ch-move-" + fullMoveCount + "\"><td>" + fullMoveCount + "</td>" + moveLogItem + "</tr>");
  }
  else
  {
    logEl.find(".ch-move-" + (fullMoveCount - 1)).append(moveLogItem);
  }
};


/**
 *
 * @param {*} gameArray
 */
var buildMyGamesUl = function(gameArray)
{
  // Do nothing if nothing changed
  if(isEqual(myGames, gameArray))
  {
    return;
  }
  for(var i in gameArray)
  {
    myGames[i] = gameArray[i];
  }

  // Check edge case: No games
  if(!gameArray || gameArray === undefined || Object.keys(gameArray).length === 0)
  {
    myGamesUl.html("None");
    return;
  }
  // Rebuild list by looping through games and create li per game
  myGamesUl.empty();
  Object.keys(gameArray).forEach(function(key, index)
  {
    myGamesUl.append(
        "<li data-id=\"" + key + "\""
      + "data-name=\"" + key + "\">"
      + this[key].name
      + (this[key].isPrivate? " [Private]" : "")
      + "</li>");
  }, gameArray);
  // Re-select active challenge
  if(activeChallengeHash)
  {
    setSelectedGame(activeChallengeHash);
  }
};


/**
 * Set Game state to GAME_STATE_EMPTY
 */
var resetGamePanel = function()
{
  gameState             = GAME_STATE_EMPTY;
  squareToHighlight     = null;
  hasProposedMove       = false;
  lastValidMove         = null;
  lastSubmittedMove     = null;
  canWhitePlay          = null;
  lastSubmittedFen      = null;
  canUndoMove           = false;
  canSubmit             = false;
  mustSubmitOnHolochain = true;
  moveCount             = 0;
  myTurn                = null;
  loadedGame            = null;
  cachedSanMoves        = "";

  gameEngine.reset();
  board.clear();
  board.orientation('white');

  setSelectedGame(null);

  removeHighlights('b');
  removeHighlights('w');
  logEl.empty();
  logEl.append("<tr><th>#</th><th>White</th><th>Black</th></tr>");
  $('#challenge-button').prop("disabled", true);
  $('#private-challenge-button').prop("disabled", true);
  $('#submit-button').prop("disabled", true);
  $('#undo-button').prop("disabled", true);
  $('#reset-button').prop("disabled", true);
  $('#sandbox-button').prop("disabled", false);

  GameTitleEl.html("");
  challengeeHandle = '';
  updateGameStatusLabel();
  updateTurnColorLabel();
};


/**
 * Re-load current game if it's not my turn
 */
var updateLoadedGame = function()
{
  if(loadedGame && !myTurn)
  {
    loadGame();
  }
};


//===============================================================================
// MAIN
//==============================================================================

console.log("holochess.js INIT");

// Setup Chessboard
// ================
var ChessboardConfig =
{
  position          : 'start',
  showNotation      : false,
  draggable         : true,
  moveSpeed         : 'slow',
  snapbackSpeed     : 200,
  snapSpeed         : 100,
  onDragStart       : board_onDragStart,
  onDrop            : board_onDrop,
  onSnapEnd         : board_onSnapEnd,
  onMouseoutSquare  : board_onMouseoutSquare,
  onMouseoverSquare : board_onMouseoverSquare,
  // onMoveEnd      : board_onMoveEnd // not called because there are no animations
};

// Setup chess board and chess engine
var board      = Chessboard('#myBoard', ChessboardConfig);
var gameEngine = new Chess();

// Setup data fetching from Holochain
hcpGetMyHandle().then(
  function(myHandle)
  {
    myHandleEl.html("(" + myHandle + ")");

    getAllHandles();
    setInterval(getAllHandles, 2000);
    pmsRefreshMyGamesUl().then(
      function(/* resolve */)
      {
        setInterval(pmsRefreshMyGamesUl, 2000);
        setInterval(updateLoadedGame, 2000);

        // Reset Game state
        resetGamePanel();
        setSelectedPlayer(null);
      });
  });

})(); // end anonymous wrapper