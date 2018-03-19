// Copyright (C) 2018, Damien Douté
// Use of this source code is governed by GPLv3 found in the LICENSE file
//---------------------------------------------------------------------------------------

// holo-bridge.js
// Responsable only for communication with holochain zome
//      Doesnt know anything about html / css
// Called by holochain.js

//===============================================================================
// GLOBALS
// ==============================================================================

var g_myHash                 = null; // Cached hashkey of this Agent
var g_myHandle               = null; // Cached Handle of this Agent
var g_loadedChallengeHashkey = null; // Challenge hashkey loaded on chessboard
var g_myGames                = null; // View-model for Challenges


//===============================================================================
// HOLOCHAIN PROMISE - HCP
// ==============================================================================

function hcp(fn, data)
{
  return new Promise(function(resolve, reject)
                    {
                      // Do the usual XHR stuff
                      var req = new XMLHttpRequest();
                      req.open('POST', "/fn/Holochess/" + fn, true);

                      // req.setRequestHeader('Content-type', 'application/json')

                      req.onload = function()
                                  {
                                    // 'load' triggers for 404s etc
                                    // so check the status
                                    if (req.status == 200)
                                    {
                                      // Resolve the promise with the response text
                                      resolve(req.response);
                                    }
                                    else
                                    {
                                      // Otherwise reject with the status text
                                      reject(Error(req.statusText));
                                    }
                                  };

                      // Handle network errors
                      req.onerror = function() { reject(Error("HCP Error")); };

                      // Make the request
                      // var reqData = JSON.stringify({'content': data, 'timestamp': 101010})
                      req.send(data);
                    });
}


/**
 * HC Promise for JSON DataFormat
 */
function hcp_json(fn, data)
{
  return hcp(fn, data).then(JSON.parse);
}

//============================================================================
// GET HANDLES / AGENTS
//============================================================================


/** 
 * Get this Agent's Hash
 * Tries to get cache first
 */
function hcp_getMyHash() 
{
  if(g_myHash)
  {
    return Promise.resolve(g_myHash);
  }
  return hcp("getMyHash").then(function(str)
        {
          g_myHash = str;
          return g_myHash;
        });
}


/**
 * 
 */
function hcp_getHandle(agentHashkey)
{
  // console.log("hcp_getHandle called: " + agentHashkey);
  if (agentHashkey == undefined)
  {
    console.log("hcp_getHandle abort: bad arguments");
    return Promise.reject();
  }    
  return hcp("getHandle", agentHashkey);
}


function hcp_getMyHandle() 
{
  if(g_myHandle)
  {
    return Promise.resolve(g_myHandle);
  }
  return hcp_getMyHash().then(function(hash) 
         {
          return hcp_getHandle(hash).then(function(str)
                        {
                          g_myHandle = str; 
                          return g_myHandle;               
                        }
                        ,function(err)
                        {
                          console.log("hcp_getMyHandle failed: " + err);
                        });
        });
}


/**
 * 
 */
function hcp_getAllHandles()
{ 
  return hcp_json("getAllHandles"); 
}


//============================================================================
// GET CHALLENGES / MOVES
//============================================================================

/**
 * 
 * @param {*} gameHashkey 
 */
function hcp_getMoves(gameHashkey) 
{
  console.log("hcp_getMoves called: " + gameHashkey);
  
  g_loadedChallengeHashkey = gameHashkey;

  var promise = hcp_json("getMoves", JSON.stringify(gameHashkey)); // because "CallingType": "json"

  return promise.then(function(moveArray)
        {
          console.log("hcp_getMoves succeeded: " + moveArray.length);             
          return moveArray;
        },
        function(err)
        {
          console.log("hcp_getMoves failed: " + err); 
          g_loadedChallengeHashkey = null;
          return [];
        });
}


/**
 * 
 */
function hcp_getChallengeHandles(challengeResponse)
{
  //console.log("hcp_getChallengeHandles called: " + JSON.stringify(challengeResponse));
  if (challengeResponse == undefined)
  {
    console.log("hcp_getChallengeHandles abort: bad arguments");
    return Promise.reject();
  }    
  return hcp_getHandle(challengeResponse.Entry.challenger).then(function(str)
        {
          g_myGames[challengeResponse.Hash].challengerHandle = str;
          return hcp_getHandle(challengeResponse.Entry.challengee).then(function(str)
                  {
                    var game = g_myGames[challengeResponse.Hash];

                    g_myGames[challengeResponse.Hash].challengeeHandle = str;

                    // Compute game state
                    // assert(g_myHash);
                    g_myGames[challengeResponse.Hash].iAmChallenger = (game.challenger === g_myHash);
                    const iAmChallenger = g_myGames[challengeResponse.Hash].iAmChallenger;
                    g_myGames[challengeResponse.Hash].iPlayWhite    = (iAmChallenger && game.challengerPlaysWhite || 
                                                                      !iAmChallenger && !game.challengerPlaysWhite);
                                        
                    // generate name                    
                    const whiteHandle = (game.challengerPlaysWhite? game.challengerHandle : game.challengeeHandle);
                    const blackHandle = (game.challengerPlaysWhite? game.challengeeHandle : game.challengerHandle);

                    var date = new Date();
                    date.setTime(game.timestamp);
                    const datestr = date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
                    //+ " " + date.toLocaleTimeString();

                    g_myGames[challengeResponse.Hash].name = whiteHandle + " vs. " + blackHandle + " (" + datestr + ")";                  
                  });
        });
}


/**
 * When returned, g_myGames should be filled with Entries and challengeeHandle & challengerHandle.
 */
function hcp_getMyGames() 
{
  return hcp_json("getMyGames").then(function(challengeEntries) 
            {
              // console.log("hcp_getMyGames response:\n" + JSON.stringify(challengeEntries) + "\n");
              g_myGames = new Object();
              for(let i = 0; i < challengeEntries.length; i++)
              {
                g_myGames[challengeEntries[i].Hash] = challengeEntries[i].Entry;
              }              
              return Promise.all(challengeEntries.map(hcp_getChallengeHandles));
            }).catch(function(err)
                     {    
                      console.log("hcp_getMyGames failed");                 
                     });          
}


//============================================================================
// COMMITS
//============================================================================

// 
function hcp_commitChallenge(challengeeHashkey) 
{
  // Check pre-conditions
  if (!challengeeHashkey || challengeeHashkey == undefined) 
  {
    alert("pick a player first!");
    return Promise.reject();
  }
  // Create Holochain Entry
  const challengeEntry = {
    timestamp           : new Date().valueOf(),
    challengee          : challengeeHashkey,
    challengerPlaysWhite: true,                  // FIXME: bind to variable
    isGamePublic        : true                   // FIXME: bind to variable
  }
  // Create Promise
  return hcp_json("commitChallenge", JSON.stringify(challengeEntry));  
}


// 
function hcp_commitMove(gameHashkey, sanMove, index) 
{
  console.log("hcp_commitMove: " + index + ". " + sanMove + " | " + gameHashkey);  
  // Check pre-conditions
  if (   !gameHashkey || gameHashkey == undefined
      || !sanMove || sanMove == undefined
      || index == undefined) 
  {
    alert("Failed committing move!");
    return Promise.reject();
  }
  // Create Promise
  return hcp("commitMove", JSON.stringify({gameHash:gameHashkey, san:sanMove, index:index}));
}


//============================================================================
// INIT
//============================================================================

/**
 * Once page loaded, get my local info
 */
$(window).ready(function() 
{
  console.log("holo-bridge.js INIT");

  hcp_getMyHash();
  hcp_getMyHandle();
});