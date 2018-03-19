// holochess.js v@VERSION
// https://github.com/ddd-mtl/holochess/
//
// Copyright (c) 2018, Damien Douté


// start anonymous scope
;(function () {
'use strict'

// CONSTANTS
var startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

var APP_STATE_NULL              = 1 << 0;
var APP_STATE_EMPTY             = 1 << 1;
var APP_STATE_SANDBOX           = 1 << 2;
var APP_STATE_CHALLENGE_VIEWING = 1 << 3;
var APP_STATE_CHALLENGE_PLAYING = 1 << 4;

// Html Elements
var turnColorEl      = $('#turn-color');
var turnStatusEl     = $('#turn-status');
var boardStatusEl    = $('#board-status');
var myHandleEl       = $('#my-handle');
var boardEl          = $('#myBoard');
var logEl            = $('#logtable');
var GameTitleEl      = $('#active-game');
var myGamesUl        = $('#my-games');
var squareClass      = '.square-55d63';

// Game panel stateful variables
var appState = APP_STATE_NULL;
var squareToHighlight;
var colorToHighlight;
var moveCount;
var hasProposedMove;
var lastValidMove;
var lastSubmittedMove;
var canWhitePlay;
var lastSubmittedFen;
var canUndoMove;    
var mustSubmitOnHolochain; // true if game state required submission
var canSubmit;             // can this player submit a move
var loadedGame;
var myTurn;
var challengeeHandle;
var cachedSanArray;

// APP Stateful variables
var activeOpponentHashkey  = null;
var activeChallengeHashkey = null;
var myGames;      // Cache of all my Games
var allHandles;   // Cache of all known Handles on the holochain DHT


// utils
// ========================================================================

var removeHighlights = function(color)
{
  //console.log(boardEl.find(squareClass));
  boardEl.find(squareClass).removeClass('highlight-' + color);
};


/**
 * 
 * @param {*} value 
 * @param {*} other 
 */
var isEqual = function (value, other) 
{
	// Get the value type
	var type = Object.prototype.toString.call(value);

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
	var valueLen = type === '[object Array]' ? value.length : Object.keys(value).length;
	var otherLen = type === '[object Array]' ? other.length : Object.keys(other).length;
  if (valueLen !== otherLen)
  {
    return false;
  }

	// Compare two items
  var compare = function(item1, item2) 
  {
		// Get the object type
		var itemType = Object.prototype.toString.call(item1);

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
    for (var i = 0; i < valueLen; i++)
    {
			if (compare(value[i], other[i]) === false) return false;
		}
	} else {
    for (var key in value)
    {
			if (value.hasOwnProperty(key)) {
				if (compare(value[key], other[key]) === false) return false;
			}
		}
	}
	// If nothing failed, return true
	return true;
};


/**
 * 
 */
var submitMove = function() 
{
  canUndoMove       = false;
  lastSubmittedMove = lastValidMove;

  updateTurnColor();
  lastSubmittedFen = gameEngine.fen();
  $('#submit-button').prop("disabled", true);
  $('#undo-button').prop("disabled", true); 

  // undo-redo to get last Move object
  const lastMove = gameEngine.undo();
  gameEngine.move(lastMove);
  const lastSan = lastMove.san;

  console.log("Submit Move: " + lastSubmittedMove + " | " + lastSan);

  if(mustSubmitOnHolochain)
  {
    hcp_commitMove(g_loadedChallengeHashkey, lastSan, moveCount);
  }
  updateGame(lastMove);
  myTurn = false;    
}  


// Chessboard callbacks
// ========================================================================

// only pick up pieces if game not over and for the side to move
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
 * @param {square coordinate string} source 
 * @param {square coordinate string} target 
 */
var board_onDrop = function(source, target) 
{
  // create Move
  var moveOrder = 
  {
    from:       source,
    to:         target,
    promotion:  'q' // NOTE: always promote to a queen for example simplicity // FIXME
  };

  const turnColor = gameEngine.turn();

  const sourcePiece = gameEngine.get(source);
  if(sourcePiece !== null 
      && (sourcePiece.color === 'b' && canWhitePlay === true
          || sourcePiece.color === 'w' && canWhitePlay !== true)
  )
  {
    return 'snapback'; 
  }

  squareToHighlight = moveOrder.to;
  colorToHighlight = turnColor;

  // try move
  var move = gameEngine.move(moveOrder);

  // discard if move order is illegal
  if (move === null) 
  {
    if(canUndoMove === false)
    {
      return 'snapback';
    }

    // unless last move is same color            
    if(sourcePiece !== null && sourcePiece.color === turnColor)
    {
      return 'snapback';
    }

    // try undoing prev move and doing new move (different piece)
    var undoneMove = gameEngine.undo();
    move = gameEngine.move(moveOrder)
    if(move === null)
    {
      if(undoneMove === null)
      {
        return 'snapback';
      }

      const isSamePiece = (undoneMove !== null && undoneMove.to === moveOrder.from);
      if(!isSamePiece)
      {
        lastValidMove = gameEngine.move(undoneMove);
        return 'snapback';
      }

      // try from previous move source                
      const moveOrderAlt = 
      {
        from:       undoneMove.from,
        to:         target,
        promotion:  'q' // FIXME: always promote to a queen for example simplicity 
      };

      console.log('Alt: ' + moveOrderAlt.from + '-' + moveOrderAlt.to);
      // if moveOrderProposalAlt.from == moveOrderProposalAlt.to
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

  canUndoMove = true;
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
  //console.log(boardEl.find('.square-' + source));

  updateStatus();

  if(!mustSubmitOnHolochain)
  {
    submitMove();
  }
};


// update the board position after the piece snap 
// for castling, en passant, pawn promotion
var board_onSnapEnd = function() 
{
  console.log("board_onSnapEnd: " + gameEngine.fen());
  board.position(gameEngine.fen());
  board_onMoveEnd();
};

var board_onMoveEnd = function() 
{
  console.log(squareToHighlight + ' into ' + (canWhitePlay? 'w' : 'b') + ' || '+ '.square-' + squareToHighlight);
  //console.log(boardEl.find('.square-' + squareToHighlight));
  boardEl.find('.square-' + squareToHighlight).addClass('highlight-' + canWhitePlay? 'w' : 'b');
};



var removeGreySquares = function()
{
  $('#myBoard .square-55d63').css('background', '');
};
  
var greySquare = function(square)
{
  var squareEl = $('#myBoard .square-' + square);        
  var background = '#a9a9a9';
  if (squareEl.hasClass('black-3c85d') === true)
  {
      background = '#696969';
  }
  squareEl.css('background', background);
};



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


//       
var board_onMouseoutSquare = function(square, piece) 
{
  removeGreySquares();
};


var updateTurnColor = function()
{
  // var moveColor = 'White';
  // if (gameEngine.turn() === 'b')
  // {
  //   moveColor = 'Black';
  // }
  // turnColorEl.html(moveColor);
  var turnText = '';
  if(myTurn !== null)
  {
    turnText = (myTurn? 'My turn' : challengeeHandle + "'s turn");
  }
  turnColorEl.html(turnText);  
};


// Tell user whats going on
var updateStatus = function() 
{
  var status = '';

  var moveColor = 'White';
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
  


// Buttons Behavior
// ========================================================================

/**
 * Set App state to APP_STATE_SANDBOX
 */
$('#sandbox-button').on('click', function() 
{
  // First set state APP_STATE_EMPTY
  resetApp();

  mustSubmitOnHolochain = false;
  canWhitePlay          = true;
  lastSubmittedFen      = startingFen;
        
  board.start(); 
  updateStatus();
  updateTurnColor();  
  challengeeHandle = '';  
  GameTitleEl.html("sandbox");  
  $('#reset-button').prop("disabled", false);
  appState = APP_STATE_SANDBOX;    
});


/**
 * Set App state to APP_STATE_EMPTY
 */
$('#reset-button').on('click', function()
{
  resetApp();
  setSelectedGame(null);
});

/**
 * 
 * @param {*} ChallengeHashkey 
 */
var loadGame = function(ChallengeHashkey)
{
  if(!ChallengeHashkey || ChallengeHashkey == undefined)
  {
    ChallengeHashkey = g_loadedChallengeHashkey;
  }

  return hcp_getMoves(ChallengeHashkey).then(function(sanArray)
  {
    if(sanArray && cachedSanArray && isEqual(sanArray, cachedSanArray))
    {
      return;
    }

     // First set app state to APP_STATE_EMPTY 
    resetApp();
    cachedSanArray = sanArray;    
    canWhitePlay = true;

    // Get Game
    loadedGame = myGames[g_loadedChallengeHashkey];

    // Go through all the moves
    for(let i = 0; i < sanArray.length; i++)
    {
      console.log("\t" + i + ". " + sanArray[i]);
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

    if(!loadedGame.iPlayWhite)
    {
      console.log("\t\tBOARD FLIP");
      board.orientation('black');
    }

    myTurn = (loadedGame.iPlayWhite && canWhitePlay ||
              !loadedGame.iPlayWhite && !canWhitePlay);

    canSubmit = myTurn;

    // Update Html
    challengeeHandle = (loadedGame.iAmChallenger? loadedGame.challengeeHandle : loadedGame.challengerHandle);                              
    GameTitleEl.html(loadedGame.name);
    $('#reset-button').prop("disabled", false);  
    updateStatus();
    updateTurnColor(); 
  
    setSelectedGame(ChallengeHashkey);

    // Update state flag
    appState = APP_STATE_CHALLENGE_VIEWING;
  });
};


/**
 * 
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


$('#submit-button').on('click', submitMove);


$("#challenge-button").on("click", function()
{
  hcp_commitChallenge(activeOpponentHashkey).then(function(challengeHashkey)
  {
    // console.debug("new game: " + str);
    setSelectedPlayer(null);
    getMyGames().then(function()
    {
      loadGame(challengeHashkey);
    });    
  });
});    


/**
 * Update Handles list
 */
var getAllHandles = function()
{
  hcp_getAllHandles().then(function(allHandlesArg)
  {
    updateOpponentList(allHandlesArg);
  });  
}


/**
 * Update Games list
 */
var getMyGames = function()
{
  return hcp_getMyGames().then(function()
    {  
      buildMyGamesUl(g_myGames);
    })
    .catch(function(err)
    {
      console.log("hcp_getMyGames failed: " + err);
    });
};


/**
 * 
 * @param {*} agentHashkey 
 */
var setSelectedPlayer = function(agentHashkey)
{
  activeOpponentHashkey = agentHashkey;  
  $("#players li").removeClass("selected-player");
  if(activeOpponentHashkey)
  {
    var elem = $("#players li[data-id=" + activeOpponentHashkey + "]");
    $(elem).addClass("selected-player");
  }
  $('#challenge-button').prop("disabled", activeOpponentHashkey == null); 
};


// Select Opponent
$("#players").on("click", "li", function()
{
  setSelectedPlayer($(this).data('id'));
}); 


// Select Game
var setSelectedGame = function(challengeHashkey)
{
  activeChallengeHashkey = challengeHashkey;       
  $('#my-games li').removeClass("selected-player");        
  if(activeChallengeHashkey)
  {
    var elem = $("#my-games li[data-id=" + activeChallengeHashkey + "]");
    $(elem).addClass("selected-player"); 
  }
};


// Select Game
$("#my-games").on("click", "li", function()
{
  cachedSanArray = null;
  loadGame($(this).data('id'));
});

    
//===============================================================================
// OPPONENTS
// ==============================================================================

/**
 * 
 * @param {Array of handle_links} allHandles 
 */
var updateOpponentList = function(allHandlesArg) 
{
  // Don't update if nothing has changed
  if(isEqual(allHandles, allHandlesArg))
  {
    return;
  }
  allHandles = allHandlesArg;
  $("#players").empty();
  for (var x = 0; x < allHandles.length; x++) 
  {
    if(allHandles[x].Hash == g_myHash) // FIXME must get agent hash with that handle :(
    {
      continue;
    }    
    $("#players").append(makePlayerLi(allHandles[x]));
  }
}


/**
 * return html string of Player handle for an UL
 * @param {Link} handleLink 
 */
var makePlayerLi = function(handleLink) 
{
  return  "<li data-id=\"" + handleLink.Hash + "\""
        + "data-name=\"" + handleLink.Entry + "\">"
        + handleLink.Entry
        + "</li>";
}


//===============================================================================
// GAMES / CHALLENGES
// ==============================================================================

/**
 * Update Game state with new move
 * @param {moveObject} newMove 
 */
var updateGame = function(newMove)
{
  moveCount++;
  canWhitePlay = !canWhitePlay;
  canSubmit = !canSubmit;

  const fullMoveCount = Math.floor(moveCount / 2);

  // Update log UI
  var moveLogItem = "<td>" + newMove.from +'-' + newMove.to + "</td>";   
  if(gameEngine.turn() == 'b') // if current turn is black, that means white has played
  {            
    logEl.append("<tr class=\"ch-move-" + fullMoveCount + "\"><td>" + fullMoveCount + "</td>" + moveLogItem + "</tr>");
  }
  else
  {
    logEl.find(".ch-move-" + (fullMoveCount - 1)).append(moveLogItem);
  } 
}


/**
 * 
 * @param {*} gameArray 
 */
var buildMyGamesUl = function(gameArray)
{
  // Check edge case: No games
  if(!gameArray || gameArray === undefined || gameArray.length == 0)
  {
    myGamesUl.html("None");
    return;
  }
  // Check if something changed
  if(isEqual(myGames, gameArray))
  {
    return;
  }
  // Loop through games and create li per game
  myGames = gameArray;
  myGamesUl.empty();
  Object.keys(gameArray).forEach(function(key, index) 
  {
    myGamesUl.append(
        "<li data-id=\"" + key + "\""
      + "data-name=\"" + key + "\">"
      + this[key].name
      + "</li>");
  }, gameArray);
  // Re-select active challenge
  if(activeChallengeHashkey)
  {
    setSelectedGame(activeChallengeHashkey);
  }  
}


/** 
 * Set App state to APP_STATE_EMPTY
 */      
var resetApp = function()
{
  squareToHighlight     = null;
  colorToHighlight      = null;
  hasProposedMove       = false;
  lastValidMove         = null;
  lastSubmittedMove     = null;
  canWhitePlay          = null;
  lastSubmittedFen      = null;
  canUndoMove           = false;
  canSubmit             = false;
  mustSubmitOnHolochain = true;
  moveCount             = 0;

  myTurn = null;
  loadedGame = null;
  cachedSanArray = null;

  gameEngine.reset();
  board.clear();
  board.orientation('white');

  setSelectedGame(null);

  removeHighlights('b');
  removeHighlights('w');        
  logEl.empty();
  logEl.append("<tr><th>#</th><th>White</th><th>Black</th></tr>");
  $('#submit-button').prop("disabled", true);
  $('#undo-button').prop("disabled", true);
  $('#reset-button').prop("disabled", true);  
  $('#sandbox-button').prop("disabled", false);  

  $('#load-game-button').prop("disabled", true); 
  $('#challenge-button').prop("disabled", true); 

  GameTitleEl.html("");
  challengeeHandle = '';
  updateStatus();
  updateTurnColor();

  // Update state flag
  appState = APP_STATE_EMPTY;    
}


/**
 * Re-load current game if it's not my turn
 */
var updateLoadedGame = function()
{
  if(loadedGame && !myTurn)
  {
    const tmp = activeChallengeHashkey;
    loadGame();
  }
}  

//===============================================================================
// MAIN
//==============================================================================

console.log("holochess.js INIT");

// Setup Chessboard
// ================
var ChessboardConfig = 
{
    position     : 'start',
    showNotation : false,
    draggable    : true,
    moveSpeed    : 'slow',
    snapbackSpeed: 200,
    snapSpeed    : 100,
    onDragStart  : board_onDragStart,
    onDrop       : board_onDrop,
    onSnapEnd    : board_onSnapEnd,
    onMouseoutSquare: board_onMouseoutSquare,
    onMouseoverSquare: board_onMouseoverSquare,        
    // onMoveEnd    : board_onMoveEnd // not called because there are no animations
};

var board = Chessboard('#myBoard', ChessboardConfig);
// Setup chess engine
var gameEngine = new Chess();

// var board = Chessboard('#myBoard2', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R')
// var board = Chessboard('#myBoard', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R')

// Get data from HC
hcp_getMyHandle().then(function(myHandle)
{
  myHandleEl.html("(" + myHandle + ")");
});
getAllHandles();
setInterval(getAllHandles, 2000);
getMyGames();
setInterval(getMyGames, 2000);

setInterval(updateLoadedGame, 2000);

resetApp();

})() // end anonymous wrapper