// holochess.js v@VERSION
// https://github.com/ddd-mtl/holochess/
//
// Copyright (c) 2018, Damien Douté


// start anonymous scope
;(function () {
    'use strict'

    // Setup chess engine
    var game = new Chess();

    var statusEl    = $('#status');
    var turnColorEl = $('#turn-color');
    var boardEl     = $('#myBoard');
    var logEl       = $('#logtable');
    var squareClass = '.square-55d63';

    var squareToHighlight;
    var colorToHighlight;
    var moveCount         = 0;
    var hasProposedMove   = false;
    var lastValidMove     = null;
    var lastSubmittedMove = null;
    var canWhitePlay      = true;
    var lastSubmittedFen  = null;
    var canUndoMove       = false;

    // utils
    var removeHighlights = function(color)
    {
        //console.log(boardEl.find(squareClass));
        boardEl.find(squareClass).removeClass('highlight-' + color);
    };


    // Setup Callbacks
    // ===============

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
  
  
    // Process move on drop
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
        $('#submitBtn').prop("disabled", true);
        if(lastSubmittedFen !== fen)
        {
            $('#submitBtn').prop("disabled", false);
        }
        else
        {
            canUndoMove = false;
        }
        $('#undoBtn').prop("disabled", !canUndoMove);

        // highlight move
        const highlightColor = (canWhitePlay? 'w' : 'b');        
        removeHighlights(highlightColor);        
        console.log(moveOrder.from +'-' + moveOrder.to + ' | ' + highlightColor);        
        boardEl.find('.square-' + source).addClass('highlight-' + highlightColor);
        boardEl.find('.square-' + target).addClass('highlight-' + highlightColor);
        //console.log(boardEl.find('.square-' + source));

        updateStatus();
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
      

      var resetPage = function()
      {
        removeHighlights('b');
        removeHighlights('w');
        squareToHighlight = null;
        colorToHighlight  = null;
        hasProposedMove   = false;
        lastValidMove     = null;
        lastSubmittedMove = null;
        moveCount         = 0;
        canWhitePlay      = true;
        lastSubmittedFen  = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        canUndoMove       = false;
        logEl.empty();
        logEl.append("<tr><th>#</th><th>White</th><th>Black</th></tr>");
        $('#submitBtn').prop("disabled", true);
        $('#undoBtn').prop("disabled", !canUndoMove);
      }


      var loadGameCallback = function(sanArray)
      {
          console.log("loadGameCallback:");        
          game.reset();
          for(let i = 0; i < sanArray.length; i++)
          {
              console.log("\t" + i + ". " + sanArray[i]);
              let move = game.move(sanArray[i]);            
              if (move === null)
              {
                  alert("invalid move:" + sanArray[i]);
              }
          }
          board_onSnapEnd();
      }
  
      var loadGameRequest = function()
      {
          console.log("loadGameRequest called (" + g_activeGame + " | " + g_loadedGame + ")");
          //if(g_activeGame && g_activeGame !== g_loadedGame)
          {
              loadGame(g_activeGame, loadGameCallback);
          }
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

    // var board = Chessboard('#myBoard2', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R')
    // var board = Chessboard('#myBoard', 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R')

    console.log("holochess.js");
    resetPage();
    updateStatus();
    updateTurnColor();
    $("#load-game-button").click(loadGameRequest);

    // Button Behavior
    // ===============

    $('#startBtn').on('click', function() 
    {
        game.reset();
        board.start();
        resetPage();
        updateStatus();
        updateTurnColor();
    });


    $('#undoBtn').on('click', function() 
    {
        if(canUndoMove === true)
        {
            game.undo();
            lastSubmittedFen = game.fen();
            $('#submitBtn').prop("disabled", true);            
            lastSubmittedMove = null;
            canUndoMove = false;
            board_onSnapEnd();
        }
    });
    
    $('#get-handles-button').on('click', function() 
    {
        getAllHandles();
    });

    $('#get-games-button').on('click', function() 
    {
        getMyGames();
    });

    $('#submitBtn').on('click', function() 
    {
        canUndoMove       = false;
        lastSubmittedMove = lastValidMove;
        canWhitePlay      = !canWhitePlay;
        updateTurnColor();
        lastSubmittedFen = game.fen();
        $('#submitBtn').prop("disabled", true);
        $('#undoBtn').prop("disabled", true); 

        const history = game.history();
        const lastSan = history[history.length - 1];

        console.log("Submit Move: " + lastSubmittedMove + "\t history: " + history.length + " | " + lastSan);

        commitMove(g_loadedGame, lastSan);

        // Update UI
        if(game.turn() == 'b') // if current turn is black, that means white has played
        {
            moveCount++;
            logEl.append("<tr class=\"ch-move-" + moveCount + "\"><td>" + moveCount + "</td><td>" + lastSubmittedMove.from +'-' + lastSubmittedMove.to + "</td></tr>");
        }
        else
        {
            logEl.find(".ch-move-" + moveCount).append("<td>" + lastSubmittedMove.from +'-' + lastSubmittedMove.to + "</td>");
        }        
    });   

})() // end anonymous wrapper