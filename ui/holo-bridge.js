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

var g_myGames                 = null; // Cached Challenges & VM data

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
// function hc_getAllAgents(callbackFn)
// {
//   if (callbackFn == undefined)
//   {
//     return;
//   }       
//   ajax_send("getAllAgents", 
//             undefined, 
//             function(json)
//             {
//                 callbackFn(JSON.parse(json));
//             }
//             );
// }


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


//===============================================================================
// HOLOCHAIN PROMISES
// ==============================================================================

function hc_promise(fn, data)
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
                      req.onerror = function() { reject(Error("hc_promise Error")); };

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
  return hc_promise(fn, data).then(JSON.parse);
}


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
  return hc_promise("getMyHash").then(function(str)
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
  console.log("hcp_getHandle called: " + agentHashkey);
  if (agentHashkey == undefined)
  {
    console.log("hcp_getHandle abort: bad arguments");
    return Promise.reject();
  }    
  return hc_promise("getHandle", agentHashkey);
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
  // return hcp_json("getAllHandles").then(function(allHandles)
  //       {
  //           g_allHandles = allHandles;
  //           return allHandles;
  //       });  
  return hcp_json("getAllHandles"); 
}


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
  console.log("hcp_getChallengeHandles called: " + JSON.stringify(challengeResponse));
  if (challengeResponse == undefined)
  {
    console.log("hcp_getChallengeHandles abort: bad arguments");
    return Promise.reject();
  }    
  return hcp_getHandle(challengeResponse.Entry.challenger).then(function(str)
        {
          g_myGames[challengeResponse.Hash].challengerHandle = str;
          return hcp_getHandle(challengeResponse.Entry.opponent).then(function(str)
                  {
                    g_myGames[challengeResponse.Hash].opponentHandle = str;

                    // Compute game state
                    g_myGames[challengeResponse.Hash].iAmChallenger = (loadedGame.challenger === hc_getMyHash());
                    g_myGames[challengeResponse.Hash].iPlayWhite    = (iAmChallenger && loadedGame.challengerPlaysWhite || 
                                                                      !iAmChallenger && !loadedGame.challengerPlaysWhite);
                    g_myGames[challengeResponse.Hash].myTurn        = (iPlayWhite && canWhitePlay || !iPlayWhite && !canWhitePlay);
                                        
                    // generate name
                    const game        = g_myGames[challengeResponse.Hash];
                    const whiteHandle = (game.challengerPlaysWhite? game.challengerHandle : game.opponentHandle);
                    const blackHandle = (game.challengerPlaysWhite? game.opponentHandle : game.challengerHandle);

                    var date = new Date();
                    date.setTime(game.timestamp);
                    const datestr = date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
                    //+ " " + date.toLocaleTimeString();

                    g_myGames[challengeResponse.Hash].name = whiteHandle + " vs. " + blackHandle + " (" + datestr + ")";                  
                  });
        });
}


/**
 * When returned, g_myGames should be filled with Entries and opponentHandle & challengerHandle.
 */
function hcp_getMyGames() 
{
  return hcp_json("getMyGames", undefined).then(function(challengeEntries) 
            {
              console.log("hcp_getMyGames response:\n" + JSON.stringify(challengeEntries) + "\n");

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

// Add behavior to HTML
$(window).ready(function() 
{
  console.log("holo-bridge.js INIT");
  // $("#handle").on("click", "", openSetHandle);
  // $('#setHandleButton').click(doSetHandle);
  
  // hc_getMyHash();
  // wait for my hash before getting my handle
  // setTimeout(hc_getMyHandle, 2000);

  hcp_getMyHash();
  hcp_getMyHandle();

  // setInterval(getAllHandles, 2000);
  // hc_getAllHandles();
  // setInterval(getMyGames, 3000);
  // hc_getMyGames();
});