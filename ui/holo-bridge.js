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

var g_myHash              = null; // Cached hash of this Agent
var g_myHandle            = null; // Cached Handle of this Agent
var g_loadedChallengeHash = null; // Hash of latest loaded Challenge
var g_myGames             = null; // View-model for Challenges


//===============================================================================
// HOLOCHAIN PROMISE - HCP
// ==============================================================================

/**
 * Promise of AJAX request to Holochain
 */
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
 * Get an Agent's handle
 */
function hcp_getHandle(agentHash)
{
  // console.log("hcp_getHandle called: " + agentHash);
  if (agentHash == undefined)
  {
    console.log("hcp_getHandle abort: bad arguments");
    return Promise.reject();
  }    
  return hcp("getHandle", agentHash);
}


/**
 * Get this Agent's Handle
 * Tries to get cache first
 */
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
 * Get all Moves related to a Challenge
 */
function hcp_getMoves(challengeHash) 
{
  console.log("hcp_getMoves called: " + challengeHash);
  
  g_loadedChallengeHash = challengeHash;

  var promise = hcp_json("getMoves", JSON.stringify(challengeHash)); // because "CallingType": "json"

  return promise.then(function(moveArray)
        {         
          return moveArray;
        },
        function(err)
        {
          console.log("hcp_getMoves failed: " + err); 
          g_loadedChallengeHash = null;
          return [];
        });
}


/**
 * Generate Game from Challenge (view-model data)
 * and add Game to global Game Array
 */
function challenge2Game(challengeResponse)
{
  //console.log("hcp_getChallengeHandles called: " + JSON.stringify(challengeResponse));
  if (challengeResponse == undefined)
  {
    console.log("processChallenge abort: bad arguments");
    return Promise.reject();
  }    
  // Get challenger's handle
  return hcp_getHandle(challengeResponse.Entry.challenger).then(function(str)
        {
          g_myGames[challengeResponse.Hash].challengerHandle = str;
          // Get challengee's handle
          return hcp_getHandle(challengeResponse.Entry.challengee).then(function(str)
                  {                    
                    g_myGames[challengeResponse.Hash].challengeeHandle = str;

                    // Compute Game state
                    // assert(g_myHash);
                    var game = g_myGames[challengeResponse.Hash];                    
                    g_myGames[challengeResponse.Hash].iAmChallenger = (game.challenger === g_myHash);
                    const iAmChallenger = g_myGames[challengeResponse.Hash].iAmChallenger;
                    g_myGames[challengeResponse.Hash].iPlayWhite = (iAmChallenger && game.challengerPlaysWhite || 
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
 * Get all Challenges related to this Agent.
 * For each Challenge get player's handles and setup view-model data.
 */
function hcp_getMyGames() 
{
  return hcp_json("getMyGames").then(function(challengeEntries) 
            {
              // console.log("hcp_getMyGames response:\n" + JSON.stringify(challengeEntries) + "\n");
              // Create Games associated array with challenge's hash as key
              g_myGames = new Object();
              for(let i = 0; i < challengeEntries.length; i++)
              {
                g_myGames[challengeEntries[i].Hash] = challengeEntries[i].Entry;
              }              
              return Promise.all(challengeEntries.map(challenge2Game));
            }).catch(function(err)
                     {    
                      console.log("hcp_getMyGames failed");                 
                     });          
}


//============================================================================
// COMMITS
//============================================================================

/**
 * Submit Challenge Entry to Holochain
 */
function hcp_commitChallenge(challengeeHash) 
{
  // Check pre-conditions
  if (!challengeeHash || challengeeHash == undefined) 
  {
    alert("pick a player first!");
    return Promise.reject();
  }
  // Create Holochain Entry
  const challengeEntry = {
    timestamp           : new Date().valueOf(),
    challengee          : challengeeHash,
    challengerPlaysWhite: true,                  // FIXME: hardcoded
    isGamePublic        : true                   // FIXME: hardcoded
  }
  // Create Promise
  return hcp_json("commitChallenge", JSON.stringify(challengeEntry));  
}


/**
 * Submit Move Entry to Holochain
 */
function hcp_commitMove(challengeHash, sanMove, index) 
{
  // Check pre-conditions
  if (   !challengeHash || challengeHash == undefined
      || !sanMove || sanMove == undefined
      || index == undefined) 
  {
    alert("Failed committing move!");
    return Promise.reject();
  }
  // Create Holochain Entry
  const moveEntry = {
    challengeHash : challengeHash,
    san           : sanMove,
    index         : index
  }
  // Create Promise
  return hcp("commitMove", JSON.stringify(moveEntry));
}


//============================================================================
// INIT
//============================================================================

/**
 * Once page is loaded, get my local info
 */
$(window).ready(function() 
{
  console.log("holo-bridge.js INIT");

  hcp_getMyHash();
  hcp_getMyHandle();
});