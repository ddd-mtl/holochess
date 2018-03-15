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

var g_myHash                 = null; // Cached hashkey of this Agent
var g_myHandle               = null; // Cached Handle of this Agent
var g_loadedChallengeHashkey = null; // Challenge hashkey loaded on chessboard
//var g_loadedChallengeEntry   = null; // Cached last requested Challenge Entry

// var g_allHandles     = {};   // All known Handles on the holochain DHT

//===============================================================================
// HOLOCHAIN HELPERS
// ==============================================================================

// use send to make an ajax call to zome's exposed functions
function ajax_send(fn, data, resultFn) 
{
  console.log("calling: " + fn + " with " + JSON.stringify(data));
  $.post( "/fn/Holochess/" + fn,
          data,
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
 * Callback 'callbackFn' with agent's latest handle entry
 * @param {*} agentHashkey 
 * @param {*} callbackFn 
 */
function hc_getHandle(agentHashkey, callbackFn)
{
  console.log("hc_getHandle called: " + agentHashkey + " | " + !!callbackFn);
  if (agentHashkey == undefined || callbackFn == undefined)
  {
    console.log("hc_getHandle abort: bad arguments");
    return;
  }    
  ajax_send("getHandle", 
            agentHashkey, 
            function(str)
            {
              console.log("hc_getHandle callback");
              callbackFn(str);
            });
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
  hc_getHandle( hc_getMyHash(), 
                function(str)
                {
                  g_myHandle = str;                  
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
  ajax_send("getMyHash",
            undefined, 
            function(str)
            {
              g_myHash = str;
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
  ajax_send("getAllHandles", 
            undefined, 
            function(json)
            {
                callbackFn(JSON.parse(json));
            }
            );
}


/**
 * Calls zome's getAllHandles
 * @param {*} callbackFn 
 */
function hc_getAllAgents(callbackFn)
{
  if (callbackFn == undefined)
  {
    return;
  }       
  ajax_send("getAllAgents", 
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
            JSON.stringify({ timestamp: new Date().valueOf(), opponent: opponent, challengerPlaysWhite: true, isGamePublic: true }),  // FIXME: change constants to variables
            function(json)
            {
              console.log("Challenge Hashkey: " + json);
              // n/a
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
  ajax_send("getMyGames", 
            undefined, 
            function(json) 
            {
              console.log("hc_getMyGames response:\n" + json + "\n");
              callbackFn(JSON.parse(json));
            });
}


/** 
 * 
 */
function hc_getChallenge(challengeHashkey, callbackFn)
{
  if (challengeHashkey == undefined || callbackFn == undefined)
  {
    return;
  }    
  console.log("hc_getChallenge called: " + challengeHashkey);
  ajax_send(  "getChallenge",
              JSON.stringify(challengeHashkey), // "CallingType": "json"
              function(json)
              {
                  console.log("hc_getChallenge call returned: " + json);                    
                  if(json)
                  {
                      callbackFn(JSON.parse(json));                        
                  }      
              });    
}

//===============================================================================
// MOVES
// ==============================================================================

//
function hc_getMoves(gameHashkey, callbackFn) 
{
  console.log("hc_getMoves called: " + gameHashkey);
  // FIXME: check in canLoadGame state
  ajax_send("getMoves",
            JSON.stringify(gameHashkey), // because "CallingType": "json"
            function(json)
            {
              sanArray = JSON.parse(json);
              console.log("loadGame call returned: " + gameHashkey + "\t " + sanArray.length + " moves.");
              g_loadedChallengeHashkey = gameHashkey;
              // Return sanArray to caller
              if (callbackFn != undefined)
              {
                callbackFn(sanArray);
              }        
            });
}


// 
function hc_commitMove(gameHashkey, sanMove, index) 
{
  console.log("commitMove: " + index + ". " + sanMove + " | " + gameHashkey);
  ajax_send("commitMove",
            JSON.stringify({gameHash:gameHashkey, san:sanMove, index:index}),  
            function(str)
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
  // wait for my hash before getting my handle
  setTimeout(hc_getMyHandle, 1000);

  // setInterval(getAllHandles, 2000);
  // hc_getAllHandles();
  // setInterval(getMyGames, 3000);
  // hc_getMyGames();
});