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
var statusEl         = $('#status');
var opponentHandleEl = $('#playerid');
var myHandleEl       = $('#my-handle');
var boardEl          = $('#myBoard');
var logEl            = $('#logtable');
var GameTitleEl      = $('#active-game');
var squareClass      = '.square-55d63';

// Stateful variables
var appState = APP_STATE_NULL;
var squareToHighlight;
var colorToHighlight;
var moveCount;
var hasProposedMove;
var lastValidMove;
var lastSubmittedMove;
var canWhitePlay;
var iPlayWhite;
var lastSubmittedFen;
var canUndoMove;    
var mustSubmitOnHolochain; // true if game state required submission
var canSubmit; // can this player submit a move

var activeOpponentHashkey;
var activeChallengeHashkey;
var activeChallengeEntry;
var activeOpponentHandle;

// utils
// ========================================================================

var removeHighlights = function(color)
{
  //console.log(boardEl.find(squareClass));
  boardEl.find(squareClass).removeClass('highlight-' + color);
};


/**
 * 
 */
var submitMove = function() 
{
  canUndoMove       = false;
  lastSubmittedMove = lastValidMove;

  updateTurnColor();
  lastSubmittedFen = game.fen();
  $('#submit-button').prop("disabled", true);
  $('#undo-button').prop("disabled", true); 

  // undo-redo to get last Move object
  const lastMove = game.undo();
  game.move(lastMove);
  const lastSan = lastMove.san;

  //const history = game.history();
  //const lastSan = history[history.length - 1];

  console.log("Submit Move: " + lastSubmittedMove + " | " + lastSan);

  if(mustSubmitOnHolochain)
  {
    hc_commitMove(g_loadedChallengeHashkey, lastSan, moveCount);
  }
  updateGame(lastMove);    
}  


// Chessboard callbacks
// ========================================================================

// only pick up pieces if game not over and for the side to move
var board_onDragStart = function(source, piece, position, orientation) 
{
    if (game.game_over() === true                         
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

  const turnColor = game.turn();

  const sourcePiece = game.get(source);
  if(sourcePiece !== null 
      && (sourcePiece.color === 'b' && canWhitePlay === true
          || sourcePiece.color === 'w' && canWhitePlay !== true)
  )
  {
    return 'snapback'; 
  }

  squareToHighlight = moveOrder.to;
  colorToHighlight = turnColor;

  // removeHighlights(turnColor);
  // colorToHighlight = (turnColor === 'b' ? 'w' : 'b');

  // try move
  var move = game.move(moveOrder);

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
    var undoneMove = game.undo();
    move = game.move(moveOrder)
    if(move === null)
    {
      if(undoneMove === null)
      {
        return 'snapback';
      }

      const isSamePiece = (undoneMove !== null && undoneMove.to === moveOrder.from);
      if(!isSamePiece)
      {
        lastValidMove = game.move(undoneMove);
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
      move = game.move(moveOrderAlt);                
      if (move === null)
      {
        // Maybe failed because trying to put piece back to origin                    
        if (moveOrderAlt.from !== moveOrderAlt.to)
        {
          lastValidMove = game.move(undoneMove);
          return 'snapback';   
        }             
      }
    }   
  }

  canUndoMove = true;
  lastValidMove = move;

  const fen = game.fen();      
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
    console.log("board_onSnapEnd: " + game.fen());
    board.position(game.fen());
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
    var moveColor = 'White';
    if (game.turn() === 'b')
    {
      moveColor = 'Black';
    }
    turnColorEl.html(moveColor);
};


// Tell user whats going on
var updateStatus = function() 
{
    var status = '';
  
    var moveColor = 'White';
    if (game.turn() === 'b')
    {
      moveColor = 'Black';
    }
  
    // checkmate?
    if (game.in_checkmate() === true)
    {
      status = 'Game over, ' + moveColor + ' is in checkmate.';
    }
    // draw?
    else if (game.in_draw() === true)
    {
      status = 'Game over, drawn position';
    }
    // game still on
    else
    {
      // check?
      if (game.in_check() === true)
      {
        status += moveColor + ' is in check';
      }
    }
  
    statusEl.html(status);
    // fenEl.html(game.fen());
    // pgnEl.html(game.pgn());
  };
  

  /** 
   * Set App state to APP_STATE_EMPTY
   */      
  var resetApp = function()
  {
    squareToHighlight = null;
    colorToHighlight  = null;
    hasProposedMove   = false;
    lastValidMove     = null;
    lastSubmittedMove = null;
    canWhitePlay      = null;
    iPlayWhite        = null;
    lastSubmittedFen  = null;
    canUndoMove       = false;
    canSubmit         = false;
    mustSubmitOnHolochain        = true;
    moveCount         = 0;

    activeOpponentHashkey  = null;
    activeChallengeHashkey = null;
    activeChallengeEntry   = null;
    activeOpponentHandle   = null;

    game.reset();
    board.clear();
    board.orientation('white');
    
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
    opponentHandleEl.html("");
    updateStatus();
    updateTurnColor();
    appState = APP_STATE_EMPTY;    
  }


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
var game = new Chess();

// var board = Chessboard('#myBoard2', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R')
// var board = Chessboard('#myBoard', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R')

console.log("holochess.js");
resetApp();

// Buttons Behavior
// ========================================================================

/**
 * Set App state to APP_STATE_SANDBOX
 */
$('#sandbox-button').on('click', function() 
{
  // First set state APP_STATE_EMPTY
    resetApp();

    mustSubmitOnHolochain        = false;
    canWhitePlay      = true;
    iPlayWhite        = true;
    lastSubmittedFen  = startingFen;
         
    board.start(); 
    updateStatus();
    updateTurnColor();    
    opponentHandleEl.html("Me"); // FIXME: agent can have this handle as well :(
    GameTitleEl.html("sandbox");  
    $('#reset-button').prop("disabled", false);
    appState = APP_STATE_SANDBOX;    
});


/**
 * Set App state to APP_STATE_EMPTY
 */
$('#reset-button').on('click', resetApp);


/**
 * Set App state to APP_STATE_CHALLENGE_VIEWING
 */
$("#load-game-button").on('click', function()
{
  console.log("loadGameRequest called (" + activeChallengeHashkey + " | " + g_loadedChallengeHashkey + ")");

  //if(activeGame && activeGame !== g_loadedGame)
  {
    activeChallengeEntry = null;    
    hc_getMoves(activeChallengeHashkey, loadGameCallback);
  }
});


/**
 * 
 */
$('#undo-button').on('click', function() 
{
  if(!canUndoMove)
  {
    return;
  }

  game.undo();
  lastSubmittedFen = game.fen();            
  $('#submit-button').prop("disabled", true);
  $('#undo-button').prop("disabled", true);             
  lastSubmittedMove = null;
  canUndoMove = false;
  board_onSnapEnd();
});


$('#submit-button').on('click', submitMove);


$("#challenge-button").on("click", function()
{
  hc_commitChallenge(activeOpponentHashkey);
});    


$('#get-handles-button').on('click', function() 
{
  hc_getAllHandles(updateOpponentList);
  myHandleEl.html("(" + g_myHandle + ")");
});


$('#get-games-button').on('click', function() 
{        
  hc_getMyGames(makeMyGamesUl);
});


// Select Opponent
$("#players").on("click", "li", function()
{
  $("#players li").removeClass("selected-player");
  activeOpponentHashkey = $(this).data('id');
  displayActiveOpponent();
  $('#challenge-button').prop("disabled", false); 
}); 


// Select Game
$("#my-games").on("click", "li", function()
{
  $("#my-games li").removeClass("selected-player");
  activeChallengeHashkey = $(this).data('id');
  displayActiveGame();
  $('#load-game-button').prop("disabled", false); 
});

    
//===============================================================================
// OPPONENTS
// ==============================================================================

/**
 * 
 */
var displayActiveOpponent = function()
{
  var elem = $("#players li[data-id=" + activeOpponentHashkey + "]");
  $(elem).addClass("selected-player");
  //$("#games-header").text("Games with " + $(elem).data("name"));
  //loadHistory();
}


/**
 * 
 * @param {Array of Links} allHandles 
 */
var updateOpponentList = function(allHandles) 
{
  $("#players").empty();
  for (var x = 0; x < allHandles.length; x++) 
  {
      $("#players").append(makePlayerLi(allHandles[x]));
  }
  if (activeOpponentHashkey) 
  {
    displayActiveOpponent();
  }
}


/**
 * return html string of Player handle for an UL
 * @param {Link} handleLink 
 */
var makePlayerLi = function(handleLink) 
{
  // console.log("handle_object: " + handle_object.Hash);  
  // console.log("g_myHash     : " + g_myHash);  
  if(handleLink.Hash == g_myHash) // FIXME must get agent hash with that handle :(
  {
    return;
  }
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
  if(game.turn() == 'b') // if current turn is black, that means white has played
  {            
    logEl.append("<tr class=\"ch-move-" + fullMoveCount + "\"><td>" + fullMoveCount + "</td>" + moveLogItem + "</tr>");
  }
  else
  {
    logEl.find(".ch-move-" + (fullMoveCount - 1)).append(moveLogItem);
  } 
}


/**
 * Set App state to APP_STATE_CHALLENGE_VIEWING
 * Getting moves first, then get challenge entry, then get player's handles,
 * because simplest way to sequence async calls.
 */
var loadGameCallback = function(sanArray)
{
  console.log("loadGameCallback called");
  
  // First set app state to APP_STATE_EMPTY 
  resetApp();
  canWhitePlay = true;
  // Go through all the moves
  for(let i = 0; i < sanArray.length; i++)
  {
    console.log("\t" + i + ". " + sanArray[i]);
    let move = game.move(sanArray[i]);            
    if(move === null)
    {
      alert("invalid move:" + sanArray[i]);
      break;
    }
    // undo-redo to get last Move object
    let moveObj = game.undo();
    game.move(moveObj);
    updateGame(moveObj);
  }
  board_onSnapEnd();

  // get Challenge entry and players' handles
  hc_getChallenge(g_loadedChallengeHashkey, 
                  function(challengeEntry)
                  {
                    if(!challengeEntry)
                    {
                      console.log("\tERROR: challengeEntry null");
                      return;
                    }
                    console.log("\thc_getChallenge callback");
                    activeChallengeEntry   = challengeEntry;
                    activeChallengeHashkey = g_loadedChallengeHashkey;  
                    
                    iPlayWhite = (challengeEntry.challengerPlaysWhite 
                                  && challengeEntry.challenger === hc_getMyHash());
                    if(!iPlayWhite)
                    {
                      console.log("\t\tBOARD FLIP");
                      board.orientation('black');
                    }
                    canSubmit = (iPlayWhite && canWhitePlay || !iPlayWhite && !canWhitePlay);

                    var opponentHashkey = (challengeEntry.challenger === hc_getMyHash()? 
                                              challengeEntry.opponent 
                                            : challengeEntry.challenger); 
                    hc_getHandle(opponentHashkey, 
                                function(handle)
                                {
                                  console.log("\thc_getHandle callback");                                  
                                  activeOpponentHashkey  = opponentHashkey;
                                  activeOpponentHandle   = handle;
                                  opponentHandleEl.html(handle);
                                });
                  }); 

  GameTitleEl.html(g_loadedChallengeHashkey);
  $('#reset-button').prop("disabled", false);  
  updateStatus();
  updateTurnColor();  
  appState = APP_STATE_CHALLENGE_VIEWING; 
}


/**
 * 
 * @param {array of challenge hashkeys} gameArray 
 */
var makeMyGamesUl = function(gameArray)
{
  if(!gameArray || gameArray == undefined)
  {
    return;
  }
  $("#my-games").empty();
  for (let i = 0; i < gameArray.length; i++)
  {
    var gameHashkey = gameArray[i];
    $("#my-games").append(
        "<li data-id=\"" + gameHashkey + "\""
        + "data-name=\"" + gameHashkey + "\">"
        + gameHashkey
        + "</li>");
  }
}


/** 
 * 
 */
var displayActiveGame = function()
{
  var elem = $("#my-games li[data-id=" + activeChallengeHashkey + "]");
  $(elem).addClass("selected-player");  
  //$("#games-header").text("Games with " + $(elem).data("name"));
  //loadHistory();
}


})() // end anonymous wrapper