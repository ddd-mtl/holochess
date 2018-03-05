// Copyright (C) 2018, Damien Douté
// Based on The MetaCurrency Project (Eric Harris-Braun & Arthur Brock)
// Use of this source code is governed by GPLv3 found in the LICENSE file
//---------------------------------------------------------------------------------------

//===============================================================================
// GLOBALS
// ==============================================================================

// var g_users          = {};
var g_myHash         = null;
var g_myHandle       = null;
var g_allHandles     = {};   // All known handles on the holochain DHT
var g_activeOpponent = null; // agent hashkey selected in #players list
var g_activeGame     = null; // game hashkey selected in #my-games list
var g_loadedGame     = null; // game hashkey loaded on chessboard

//===============================================================================
// HOLOCHAIN HELPERS
// ==============================================================================

// use send to make an ajax call to your exposed functions
function hc_send(fn, data, resultFn) 
{
  console.log("calling: " + fn + " with " + JSON.stringify(data));
  $.post(
      "/fn/Holochess/" + fn,
      JSON.stringify(data),
      function(response) 
      {
          console.log("\tresponse: " + response);
          resultFn(response);
      }
  ).fail(function(response)
   {
      console.log("\tresponse to \"" + fn + "\" failed: " + response.responseText);
  })
  ;
};


//===============================================================================
// HANDLES / AGENT
// ==============================================================================

function getHandle(who, callbackFn)
{
  hc_send("getHandle",
          who, 
          function (handle)
          {
            if (callbackFn != undefined)
            {
                callbackFn(handle);
            }
          });
}

//
function getMyHandle() 
{
  getHandle(g_myHash, 
            function(handle)
            {
                g_myHandle = handle;
                $("#handle").html(handle);
            });
}

function getProfile() 
{
  hc_send("getMyHash",
          undefined, 
          function(me)
          {
              g_myHash = me;
              getMyHandle();
              $("#playerid").html(me);
          });
}

function getAllHandles(callbackFn)
{
  hc_send("getAllHandles", 
          undefined, 
          function(json)
          {
              g_allHandles = JSON.parse(json);
              updateOpponentList();
              if (callbackFn != undefined)
              {
                  callbackFn(g_allHandles);
              }
          });
}


//===============================================================================
// OPPONENTS
// ==============================================================================

function updateOpponentList() 
{
  $("#players").empty();
  for (var x = 0; x < g_allHandles.length; x++) 
  {
      $("#players").append(makePlayerLi(g_allHandles[x]));
  }
  if (g_activeOpponent) 
  {
      setActiveOpponent();
  }
}

function makePlayerLi(handle_object) 
{
  // console.log("handle_object: " + handle_object.Hash);  
  // console.log("g_myHash     : " + g_myHash);  
  if(handle_object.Hash == g_myHash) // FIXME must get agent hash with that handle :(
  {
    return;
  }
  return  "<li data-id=\"" + handle_object.Hash + "\""
        + "data-name=\"" + handle_object.Entry + "\">"
        + handle_object.Entry
        + "</li>";
}


//
function selectOpponent(event) 
{
  $("#players li").removeClass("selected-player");
  g_activeOpponent = $(this).data('id');
  setActiveOpponent();
}


//
function setActiveOpponent()
{
  var elem = $("#players li[data-id=" + g_activeOpponent + "]");
  $(elem).addClass("selected-player");
  //$("#games-header").text("Games with " + $(elem).data("name"));
  //loadHistory();
}

//===============================================================================
// GAMES
// ==============================================================================

// 
function commitChallenge() 
{
  if (!g_activeOpponent || g_activeOpponent == undefined) 
  {
      alert("pick a player first!");
      return;
  }
  hc_send("commitChallenge", 
          JSON.stringify({ opponent: g_activeOpponent, challengerPlaysWhite: true, isGamePublic: true }),  // FIXME
          function(result)
          {
              result = JSON.parse(result);
              console.log("Challenge Hashkey: " + result);
          }
        );  
}


function makeGameLi(gameHashkey) 
{
  // console.log("handle_object: " + handle_object.Hash);  
  // console.log("g_myHash     : " + g_myHash);  

  return  "<li data-id=\"" + gameHashkey + "\""
        + "data-name=\"" + gameHashkey + "\">"
        + gameHashkey
        + "</li>";
}


function getMyGames() 
{
    $("#my-games").empty();
  hc_send("getMyGames", 
          undefined, 
          function(json) 
          {
            gameArray = JSON.parse(json);
            // $("#my-games").html("");
            for (var x = 0; x < gameArray.length; x++)
            {
                $("#my-games").append(makeGameLi(gameArray[x]));
            }
          });
}


//
function selectGame(event) 
{
  $("#my-games li").removeClass("selected-player");
  g_activeGame = $(this).data('id');
  setActiveGame();
}


//
function setActiveGame()
{
  var elem = $("#my-games li[data-id=" + g_activeGame + "]");
  $(elem).addClass("selected-player");
  //$("#games-header").text("Games with " + $(elem).data("name"));
  //loadHistory();
}


//
function loadGame(gameHashkey, callbackFn) 
{
    console.log("loadGame called: " + gameHashkey);
    // FIXME: check in canLoadGame state
    hc_send("getMoves",
            gameHashkey, 
            function(result)
            {
                sanArray = JSON.parse(result);
                console.log("loadGame call returned: " + gameHashkey + "\t " + sanArray.length + " moves.");
                g_loadedGame = gameHashkey;
                // Return sanArray to caller
                if (callbackFn != undefined)
                {
                    callbackFn(sanArray);
                }        
            });
}


// 
function commitMove(gameHashkey, sanMove) 
{
    console.log("commitMove: " + sanMove + " | " + gameHashkey);
    hc_send("commitMove",
            JSON.stringify({gameHash: gameHashkey, san: sanMove}), 
            //JSON.stringify({gameHash: gameHashkey.toString(), san: sanMove}), 
            //{gameHash: gameHashkey, san: sanMove}, 
            //{gameHash: gameHashkey.toString(), san: sanMove}, 
            //{gameHash: JSON.stringify(gameHashkey), san: sanMove},     
            function(moveHashkey)
            {
                // n/a
                // Check no error?
            });
}

//============================================================================

// Add behavior to HTML
$(window).ready(function() 
{
    console.log("holochess-com.js");
  // $("#handle").on("click", "", openSetHandle);
  // $('#setHandleButton').click(doSetHandle);
  $("#players").on("click", "li", selectOpponent);
  $("#challenge-button").click(commitChallenge);
  getProfile();
  // setInterval(getAllHandles, 2000);
  getAllHandles();

  $("#my-games").on("click", "li", selectGame);
  // setInterval(getMyGames, 3000);
  getMyGames();
});