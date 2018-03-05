// Copyright (C) 2018, Damien Douté
// Based on The MetaCurrency Project (Eric Harris-Braun & Arthur Brock)
// Use of this source code is governed by GPLv3 found in the LICENSE file
//---------------------------------------------------------------------------------------

// Responsable only for communication with holochain zome
//      Doesnt know anything about html / css
// Communicates with  Holochain.js

//===============================================================================
// GLOBALS
// ==============================================================================

var g_myHash         = null; // Cached hashkey of this Agent
var g_myHandle       = null; // Cached Handle of this Agent
var g_loadedGame     = null; // Challenge hashkey loaded on chessboard

// var g_allHandles     = {};   // All known Handles on the holochain DHT

//===============================================================================
// HOLOCHAIN HELPERS
// ==============================================================================

// use send to make an ajax call to zome's exposed functions
function ajax_send(fn, data, resultFn) 
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

/**
 * Callback callbackFn with agent's current handle
 * @param {*} agentHashkey 
 * @param {*} callbackFn 
 */
function hc_getHandle(agentHashkey, callbackFn)
{
    if (agentHashkey == undefined || callbackFn == undefined)
    {
        return;
    }    
    ajax_send("getHandle", agentHashkey, callbackFn);
}


/** 
 * Get this Agent's Handle
 * Tries to get cache first
 */
function hc_getMyHandle() 
{
    if(g_myHandle)
    {
        return g_myHandle;
    }
    hc_getHandle(hc_getMyHash(), 
                 function(handle)
                 {
                    g_myHandle = handle;
                    // $("#playerid").html(handle);
                 });
    return "";
}


/** 
 * Get this Agent's Hash
 * Tries to get cache first
 */
function hc_getMyHash() 
{
    if(g_myHash)
    {
        return g_myHash;
    }
    ajax_send(  "getMyHash",
                undefined, 
                function(me)
                {
                    g_myHash = me;
                });
    return null;
}


/**
 * Calls zome's getAllHandles
 * @param {*} callbackFn 
 */
function hc_getAllHandles(callbackFn)
{
    if (callbackFn == undefined)
    {
        return;
    }       
    ajax_send(  "getAllHandles", 
                undefined, 
                function(json)
                {
                    callbackFn(JSON.parse(json));
                }
                );
}



//===============================================================================
// CHALLENGES
// ==============================================================================

// 
function hc_commitChallenge(opponent) 
{
  if (!opponent || opponent == undefined) 
  {
      alert("pick a player first!");
      return;
  }
  ajax_send("commitChallenge", 
            JSON.stringify({ opponent: opponent, challengerPlaysWhite: true, isGamePublic: true }),  // FIXME
            function(result)
            {
                result = JSON.parse(result);
                console.log("Challenge Hashkey: " + result);
            }
            );  
}


/** 
 * Calls zome's "getMyGames"
 */
function hc_getMyGames(callbackFn) 
{
    if(callbackFn == undefined)
    {
        return;
    }     
    ajax_send(  "getMyGames", 
                undefined, 
                function(json) 
                {
                    callbackFn(JSON.parse(json));
                });
}


//===============================================================================
// MOVES
// ==============================================================================

//
function hc_getMoves(gameHashkey, callbackFn) 
{
    console.log("loadGame called: " + gameHashkey);
    // FIXME: check in canLoadGame state
    ajax_send(  "getMoves",
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
function hc_commitMove(gameHashkey, sanMove) 
{
    console.log("commitMove: " + sanMove + " | " + gameHashkey);
    ajax_send(  "commitMove",
                JSON.stringify({gameHash: gameHashkey, san: sanMove}), 
                //JSON.stringify({gameHash: gameHashkey.toString(), san: sanMove}), 
                //{gameHash: gameHashkey, san: sanMove}, 
                //{gameHash: gameHashkey.toString(), san: sanMove}, 
                //{gameHash: JSON.stringify(gameHashkey), san: sanMove},     
                function(moveHashkey)
                {
                    // n/a
                    // Check for error?
                });
}


//============================================================================

// Add behavior to HTML
$(window).ready(function() 
{
  console.log("holo-bridge.js INIT");
  // $("#handle").on("click", "", openSetHandle);
  // $('#setHandleButton').click(doSetHandle);
  
  hc_getMyHash();
  // setInterval(getAllHandles, 2000);
  // hc_getAllHandles();
  // setInterval(getMyGames, 3000);
  // hc_getMyGames();
});