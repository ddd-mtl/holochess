'use strict';

// ===============================================================================
// IMPORTS
// ===============================================================================

// chess.js


// ===============================================================================
// CONST
// ===============================================================================

var APP_ID = App.DNA.Hash;
var ME     = App.Key.Hash;

var SOURCE_AS_HASH = true;

// NOT USED YET
// var GAME_MAX_FULLMOVE             = 300;     // arbitrary limit to game size

// var GAME_STATE_NULL               = 1 << 0;
// var GAME_STATE_CHALLENGE_PENDING  = 1 << 1;
// var GAME_STATE_ACTIVE             = 1 << 2;
// var GAME_STATE_FINISHED_WHITE_WIN = 1 << 3;
// var GAME_STATE_FINISHED_BLACK_WIN = 1 << 4;
// var GAME_STATE_FINISHED_DRAW      = 1 << 5;


// ==============================================================================
// EXPOSED Functions: visible to the UI, can be called via localhost, web browser, or socket
// ===============================================================================


// HANDLES / AGENT
// ==============================================================================

/**
 * return this agent's hash
 */
function getMyHash()
{
  return ME;
}


/**
 *  return array of all handle_links where
 *  Hash is handle's agent's hashkey.
 */
function getAllHandles()
{
  var linkArray = getEntriesFromLinks(APP_ID, "player", SOURCE_AS_HASH);
  if(!linkArray)
  {
    return [];
  }
  // Sort alphabetically by handle
  linkArray.sort(function (a, b) // {a.Entry.localeCompare(b.Entry)} );
    {
      if(a.Entry < b.Entry) return -1;
      if(a.Entry > b.Entry) return 1;
      return 0;
    });
  return linkArray;
}


/**
 *  return the current handle of this node
 */
function getMyHandle()
{
  debug("getMyHandle");
  var handle = getHandle(ME);
  debug("\t" + handle);
  return handle;
}


/**
 * return the handle of an agent
 */
function getHandle(agentHash)
{
  // debug("getHandle: " + agentHash);
  var linkArray = getEntriesFromLinks(agentHash, "handle");
  if(!linkArray || linkArray.length !== 1)
  {
    return [];
  }
  return linkArray[0].Entry;
}


/**
 * commit initial handle and its links on the app's directory
 */
function commitInitialHandle(handle)
{
  // TODO confirm no collision?

   // On my source chain, commit a new handle entry
  var handleHash = commit("handle", handle);

  debug("commitInitialHandle:" + handle + " stored at " + handleHash);

  // On DHT, set links to my handle
  commit("handle_links", {Links:[{Base:ME,Link:handleHash,Tag:"handle"}]});
  commit("directory_links", {Links:[{Base:APP_ID,Link:handleHash,Tag:"player"}]});

  return handleHash;
}


//
// HOLOCHESS
// ==============================================================================

/**
 *  Create a Challenge Entry
 */
function commitChallenge(challenge)
{
  if(!challenge)
  {
    return null;
  }
  challenge.challenger = ME;

  debug("commitChallenge: "+ JSON.stringify(challenge));

  // commit challenge entry to my source chain
  var challengeHash = commit('challenge', challenge);

  debug("new challenge: "+ challengeHash + "\n\t challenger: " + ME + "\n\t challengee  :" + challenge.challengee);

  // On the DHT, put a link on my hash, and my opponents hash, to the new challenge.
  commit("challenge_links", {Links:[{Base:ME, Link:challengeHash ,Tag:"initiated"}]});
  commit("challenge_links", {Links:[{Base:challenge.challengee, Link:challengeHash,Tag:"received"}]});
  return challengeHash;
}


/**
 *  Create a Challenge Entry
 */
function commitPrivateChallenge(challenge)
{
  if(!challenge)
  {
    return null;
  }
  challenge.challenger = ME;

  debug("commitPrivateChallenge: "+ JSON.stringify(challenge));

  // commit challenge entry to my source chain
  var challengeHash = commit('private_challenge', challenge);

  debug("new challenge: "+ challengeHash + "\n\t challenger: " + ME + "\n\t challengee  :" + challenge.challengee);
  return challengeHash;
}


/**
 *  Create a Move Entry
 */
function commitMove(move)
{
  if(!move)
  {
    return null;
  }
  debug("new move on game: " + move.challengeHash + "\n\t san: " + move.san + " | " + move.index);

  // Build and commit move entry to my source chain
  var moveHash = commit('move', move);
  debug("\tmove hash: " + moveHash);
  // On the DHT, put a link on the challenge's hash to the new move.
  commit("move_links", {Links:[{Base:move.challengeHash,Link:moveHash,Tag:"halfmove"}]});
  return moveHash;
}


/**
 *
 */
function commitPrivateMove(move)
{
  if(!move)
  {
    return null;
  }
  debug("new move on private game: " + move.challengeHash + "\n\t san: " + move.san + " | " + move.index);

  // Build and commit move entry to my source chain
  var moveHash = commit('private_move', move);
  debug("\tmove hash: " + moveHash);
  return moveHash;
}


/**
 *  return array of strings of all the moves of the game, in SAN, sorted by index
 */
function getMoves(challengeHash)
{
  // getLinks from DHT
  var moves = getEntriesFromLinks(challengeHash, "halfmove");
  debug("getMoves of challenge: " + challengeHash + "\n\t moves found: " + moves.length);

  // Sort by move index
  moves.sort(function (a, b) {return a.Entry.index - b.Entry.index;} );

  // Convert to SAN string array
  var sanMoves = [];
  for(var i = 0; i < moves.length; i++)
  {
    var move = moves[i];
    sanMoves.push(move.Entry.san);
    // debug("\t " + i + ". " + move.Entry.san + " | " + move.Entry.index);
  }
  return sanMoves;
}


/**
 * Load Challenge from its hash
 * return null if requested entry is not 'challenge' type
 */
function getChallenge(hash)
{
  debug("getChallenge called: " + hash);
  var challenge = get(hash);
  debug("Challenge: " + challenge);

  // Return
  return JSON.parse(challenge);
  //return challenge; // Depends on Holochain version?
}


/**
 *
 * @param challengeHash
 * @returns {*} array of move entries
 */
function getMyPrivateMoves(challengeHash)
{
  var result = query({
    Return: {
      Hashes:false,
      Entries:true
    },
    Constrain: {
      EntryTypes: ["private_move"],
      Equals  : {"challengeHash":challengeHash}
    }
  });
  debug("Query result:\n" + result);
  // Sort by move index
  var moves = JSON.parse(result);
  moves.sort(function (a, b) {return a.index - b.index;} );
  debug("Sorted result:\n" + JSON.stringify(moves));
  return result;
}


/**
 *  return array of entries of challenges that corresponds to query parameters
 *  sorted by timestamp
 */
function getGamesFromPlayer(hash /*, stateMask, challengerHash, challengeeHash */)
{
  debug("getGamesFromPlayer: " + hash);
  // getLinks from DHT
  var initiatedChallenges = getEntriesFromLinks(hash, "initiated");
  var receivedChallenges  = getEntriesFromLinks(hash, "received");
  // debug("\t Initiated: " + initiatedChallenges.length + "  received: " + receivedChallenges.length);

  var myGames = initiatedChallenges.concat(receivedChallenges);

  // Sort by timestamp
  myGames.sort(function(a, b) {return b.Entry.timestamp - a.Entry.timestamp;} );
  debug("\t found: " + myGames.length);
  return myGames;
}

function getMyPrivateGames(/* stateMask, challengerHash, challengeeHash */)
{
  var asChallengerResult = query({
    Return: {
      Hashes:true,
      Entries:false
    },
    Constrain: {
      EntryTypes: ["private_challenge"],
      Equals  : {"challenger":ME}
    }
  });
  var asChallengeeResult = query({
    Return: {
      Hashes:true,
      Entries:false
    },
    Constrain: {
      EntryTypes: ["private_challenge"],
      Equals  : {"challengee":ME}
    }
  });
  var allMyPrivateChallenges = JSON.parse(asChallengerResult).concat(JSON.parse(asChallengeeResult));
  debug("getMyPrivateGames result:\n" + JSON.stringify(allMyPrivateChallenges));
  return result;
}



function getMyGames(/* stateMask, challengerHash, challengeeHash */)
{
  return getGamesFromPlayer(ME);
}


/**
 *  return array of entries of challenges that corresponds to query parameters
 *  sorted by timestamp
 *  return Object containing Hash->Entry properties
 */
function getGamesMapFromPlayer(hash /*, stateMask, challengerHash, challengeeHash */)
{
  debug("getGamesMapFromPlayer: " + hash);
  // getLinks from DHT
  var initiatedChallenges = getEntriesMapFromLinks(hash, "initiated");
  var receivedChallenges  = getEntriesMapFromLinks(hash, "received");
  debug("\t Initiated: " + Object.keys(initiatedChallenges).length + "  received: " + Object.keys(receivedChallenges).length);

  // Merge Maps
  // var myGames = Object.assign({}, initiatedChallenges, receivedChallenges);
  var myGames = Object();
  for (var attrname in initiatedChallenges) { myGames[attrname] = initiatedChallenges[attrname]; }
  for (var attrname in receivedChallenges)  { myGames[attrname] = receivedChallenges[attrname]; }

  debug("\t found: " + Object.keys(myGames).length);
  return myGames;
}

/**
 *  return array of entries of challenges that corresponds to query parameters
 *  sorted by timestamp
 */
function getGames(/* stateMask, challengerHash, challengeeHash */)
{
  var handleLinksArray = getAllHandles();
  var allGames = Object();
  for(var i = 0; i < handleLinksArray.length; i++)
  {
    var map = getGamesMapFromPlayer(handleLinksArray[i].Hash);
    // Object.assign(allGames, map);
    for (var attrname in map) { allGames[attrname] = map[attrname]; }
  }

  // Remove duplicate
  // var uniqueGames = allGames.filter(onlyUnique);
  // debug("\t total: " + allGames.length + " / " + uniqueGames.length);
  // Sort?
  // Done
  debug("TOTAL: " + Object.keys(allGames).length);
  return allGames;
}


// ==============================================================================
// Private Game stuff
// ==============================================================================

function requestPrivateChallenge(challengeeHash, canChallengerPlayWhite)
{
  // var myPrivateChallenge = commitPrivateChallenge(canChallengerPlayWhite);
  var response = send(challengeeHash, { type: "privateChallengeReq", canChallengerPlayWhite: canChallengerPlayWhite });
  response = JSON.parse(response);

  if(!response || !response.privateChallenge)
  {
    return { error: "challengee refused challenge" };
  }

  // create our own copy of the challenge according call from the responder
  var myPrivateChallenge = commitPrivateChallenge(ME, challengeeHash, canChallengerPlayWhite);
  if (myPrivateChallenge != response.privateChallenge)
  {
    return { error: "challenge didn't match!" };
  }
  return { privateChallenge: myPrivateChallenge };
}


/**
 * Get Opponents moves
 */
function requestOpponentsPrivateMoves(privateChallengeHash)
{
  // retrieve opponent's hash from challengeHash
  var challengeEntry = get(privateChallengeHash);
  if(challengeEntry === HC.HashNotFound)
  {
    return null;
  }
  if(ME !== challengeEntry.challengee && ME !== challengeEntry.challenger)
  {
    return null;
  }
  var opponentHash = ME === challengeEntry.challenger?
    challengeEntry.challengee
  : challengeEntry.challenger;

  // send request
  var response = send(opponentHash, {type: "movesReq", privateChallengeHash: privateChallengeHash});
  response = JSON.parse(response);
  if(!response || !response.moves)
  {
    return { error: "requestOpponentsPrivateMoves send failed" };
  }
  return response.moves;
}


/**
 * Return FEN of current game state
 * By retrieving all my private moves and all the opponents
 * private moves
 * sorting them and running them in the chess engine
 */
function getPrivateChallengeState(challengeHash)
{
  // Get each player's moves
  var opponentMoves = requestOpponentsPrivateMoves(challengeHash);
  var myMoves = getMyPrivateMoves(challengeHash);
  if(!opponentMoves || !myMoves)
  {
    debug("getPrivateChallengeState FAILED");
    return "";
  }

  // concat and sort
  var moves = myMoves.concat(opponentMoves);
  moves.sort(function (a, b) {return a.index - b.index;} );


  // Run them in the chess engine
  var chessEngine = new Chess();
  for(var i = 0; i < moves.length; i++)
  {
    var move = chessEngine.move(moves[i]);
    if(move === null)
    {
      debug("getPrivateChallengeState FAILED: Chess game playback failed on move " + i + "." + moves[i]);
      return "";
    }
  }
  // return FEN
  debug("getPrivateChallengeState: " + chessEngine.FEN());
  return chessEngine.FEN();
}


// ==============================================================================
// HELPERS: unexposed functions
// ==============================================================================

// helper function to determine if value returned from holochain function is an error
function hasErrorOccurred(result)
{
  return ((typeof result === 'object') && result.name === "HolochainError");
}


/**
 * Helper for the "getLinks" with load call.
 * Handle the no-link error case.
 * Copy the returned entry values into a nicer array
 " @param canSourceBeHash if TRUE attribute Hash will be hash of the Source
 */
function getEntriesFromLinks(base, tag, canSourceBeHash)
{
  // debug("getEntriesFromLinks: " + base + " | tag : " + tag + " | " + canSourceBeHash);
  // Get the tag from the base in the DHT
  var links = getLinks(base, tag, {Load:true});

  // Handle error
  if (hasErrorOccurred(links))
  {
    debug("getEntriesFromLinks failed: " + base + " | tag : " + tag);
    return [];
  }

  // return links;

  // Build smaller array with just Hash and Entry value
  var miniLinkArray = [];
  for (var i = 0; i < links.length; i++)
  {
      var link     = links[i];
      // debug("\n" + JSON.stringify(link));
      var miniLink = (typeof canSourceBeHash !== 'undefined'? {Hash:link.Source, Entry: link.Entry} : {Hash:link.Hash, Entry: link.Entry});
      miniLinkArray.push(miniLink);
  }
  //debug("\t" + JSON.stringify(miniLinkArray));
  return miniLinkArray;
}


/**
 * Helper for the "getLinks" with load call.
 * Handle the no-link error case.
 * Copy the returned entry values into a nicer array
 " @param canSourceBeHash if TRUE attribute Hash will be hash of the Source
 */
function getEntriesMapFromLinks(base, tag, canSourceBeHash)
{
  // debug("getEntriesMapFromLinks: " + base + " | tag : " + tag + " | " + canSourceBeHash);
  // Get the tag from the base in the DHT
  var links = getLinks(base, tag, {Load:true});

  // Handle error
  if (hasErrorOccurred(links))
  {
    debug("getEntriesMapFromLinks failed: " + base + " | tag : " + tag);
    return [];
  }

  // Build hashtable with just Entry value
  var map = {};
  for (var i = 0; i < links.length; i++)
  {
    var hash = (typeof canSourceBeHash !== 'undefined'? links[i].Source : links[i].Hash);
    map[hash] = links[i].Entry;
  }
  //debug("\t" + JSON.stringify(map));
  return map;
}


/**
 * Helper for the "getLinks" without load call.
 * Handle the no links entry error
 * Build a simpler links array
 */
function getKeysFromLinks(base, tag)
{
  // Get the tag from the base in the DHT
  var links = getLinks(base, tag, {Load:false});
  if (hasErrorOccurred(links))
  {
    debug("getKeysFromLinks failed: " + base + " | tag : " + tag);
    return [];
  }
  // debug("Links:" + JSON.stringify(links));

  // Build nicer array
  var linkHashArray = [];
  for (var i = 0; i < links.length; i++)
  {
      linkHashArray.push(links[i].Hash);
  }
  return linkHashArray;
}


// ==============================================================================
// CALLBACKS: Called by back-end system, instead of front-end app or UI
// ===============================================================================

/**
 * Called only when your source chain is generated
 * @return {boolean} success
 */
function genesis()
{
  commitInitialHandle(App.Agent.String);
  return true;
}


/**
 *
 * listen for a Private Challenge Request
 */
function receive(from, msg)
{
  if(msg.type == 'privateChallengeReq')
  {
    // Commit challenge on my chain
    var myPrivateChallenge = commitPrivateChallenge(from, ME, msg.canChallengerPlayWhite);
    return {privateChallenge: myPrivateChallenge};
  }
  else if(msg.type == 'movesReq')
  {
    // retrieve challengeEntry
    var challengeEntry = get(privateChallengeHash);
    if(challengeEntry === HC.HashNotFound)
    {
      return null;
    }
    // requester must be part of the game
    if(from !== challengeEntry.challengee && from !== challengeEntry.challenger)
    {
      return null;
    }
    return getMyPrivateMoves(msg.privateChallengeHash);
  }
  return null;
}


//  VALIDATION functions for every DHT entry change
// -----------------------------------------------------------------

/**
 * Validate Challenge Entry
 */
function validateChallenge(entry, header, pkg, source)
{
  // challenger MUST be Source
  if(entry.challenger === source)
  {
    debug("Challenge not valid because challenger is not source.");
    return false;
  }

  // Opponent MUST be different from challenger
  if(entry.challenger === entry.challengee)
  {
    debug("Challenge not valid because challenger and challengee are same.");
    return false;
  }

  // FIXME validateChallenge: challengee is in directory?

  return true;
}


/**
 *
 */
function validateMove(entry, header, pkg, sources)
{
  //debug("VALIDATE MOVE - " + sources);
  debug("VALIDATE MOVE ENTRY - " + JSON.stringify(entry));

  var sourceHash = sources[0];

  // get Challenge
  var challenge = get(entry.challengeHash);
  // Check Challenge exists and Source is part of Challenge
  if(challenge === HC.HashNotFound)
  {
    debug("validateMove FAILED: Challenge not found");
    debug("\t CHALLENGE = " + entry.challengeHash);
    return false;
  }

  // challenge = JSON.parse(challenge);
  // debug("VALIDATE MOVE - challenge - " + JSON.stringify(challenge));


  if(challenge.challenger !== sourceHash && challenge.challengee !== sourceHash)
  {
    debug("validateMove FAILED: Challenge and Source don't match.");
    debug("\t SOURCE     = " + sourceHash + " | " + typeof sourceHash);
    debug("\t CHALLENGER = " + challenge.challenger + " | " + typeof challenge.challenger);
    debug("\t CHALLENGEE = " + challenge.challengee + " | " + typeof challenge.challenger);
    return false;
  }
  // get Moves
  var moves = getMoves(entry.challengeHash);
  // var moves = getEntriesFromLinks(entry.challengeHash, 'halfmove', SOURCE_AS_HASH);
  // Check index match
  if(moves.length !== entry.index)
  {
      debug("validateMove FAILED: Bad Move.index (" + moves.length + " != " + entry.index + ")");
      return false;
  }

  // Check if its Source's turn
  var isSourceWhite = (   challenge.challenger === sourceHash && challenge.challengerPlaysWhite
                       || challenge.challengee === sourceHash && !challenge.challengerPlaysWhite);
  var canSourcePlay = ((entry.index % 2) === (!isSourceWhite % 2)); // White plays on even indices

  if(!canSourcePlay)
  {
     debug("validateMove FAILED: Not Source's turn. Source is "
            + isSourceWhite? "White" : "Black"
            + ". Move.index is " + entry.index);
    return false;
  }
  // Create chess Engine and go through all previous moves to get current game state
  //debug("validateMove CREATING CHESS ENGINE");
  var chessEngine = new Chess();
  for(var i = 0; i < moves.length; i++)
  {
      var move = chessEngine.move(moves[i]);
      if(move === null)
      {
        debug("validateMove FAILED: Chess game playback failed on move " + i + "." + moves[i]);
        return false;
      }
  }
  // Check if game is already over
  if(chessEngine.game_over())
  {
    debug("validateMove FAILED: Chess game is already finished.");
    return false;
  }
  // Try next move
  var newMove = chessEngine.move(entry.san);
  if(newMove === null)
  {
    debug("validateMove FAILED: New move is invalid ( " + entry.san + ")");
    debug(chessEngine.fen());
    return false;
  }
  // Done!
  debug("validateMove SUCCESS");
  return true;
}


/**
 * FIXME
 */
function validatePrivateMove(entry, header, pkg, sources)
{
  // FIXME
  return true;
}


/**
 *
 */
function validateLink(linkEntryType, baseHash, links, pkg, sources)
{
  debug("validate link: " + linkEntryType);
  // FIXME: validateLink()
  return true;
}


/**
 *  Commit validation dispatcher
 */
function validateCommit(entryType, entry, header, pkg, sources)
{
  // debug("validate commit: " + entryType);
  switch (entryType)
  {
    case 'private_challenge':
      return (entry.challenger !== entry.challengee);
    case 'challenge':
      return validateChallenge(entry, header, pkg, sources);
    case 'move':
      return validateMove(entry, header, pkg, sources);
    case 'private_move':
      return validatePrivateMove(entry, header, pkg, sources);
    case 'handle':
    case 'game_result':
    case 'challenge_links':
    case 'handle_links':
    case 'directory_links':
    case 'move_links':
      return true;
    default:
      // invalid entry name
      return false
  }
}


/**
 *
 */
function validatePut(entryType, entry, header, pkg, sources)
{
  debug("validate put: " + entryType);
  switch (entryType)
  {
    case 'private_challenge':
      return (entry.challenger !== entry.challengee);
    case 'challenge':
      return validateChallenge(entry, header, pkg, sources);
    case 'move':
      return validateMove(entry, header, pkg, sources);
    case 'private_move':
      return validatePrivateMove(entry, header, pkg, sources);
      case 'handle':
      case 'game_result':
        return true;
    default:
      // invalid entry name
      return false
  }
}


/**
 * TODO: Add 'challenge accepted' flag
 */
function validateMod(entryType, entry, header, replaces, pkg, sources)
{
  debug("validate mod: " + entryType + " header:" + JSON.stringify(header) + " replaces:" + JSON.stringify(replaces));

  switch (entryType)
  {
    case 'challenge':
    case 'move':
    case 'game_result':
      return false;
    case 'handle':
      return true;
    default:
      // invalid entry name
      return false;
  }
}


/**
 * TODO: Possibility to remove challenge if it has not been accepted
 */
function validateDel(entryName, hash, pkg, sources)
{
  debug("validate del: "+ entryName);
  switch (entryName)
  {
    case 'challenge':
    case 'move':
    case 'handle':
    case 'game_result':
      return false;
    default:
      // invalid entry name
      return false;
  }
}


// ==============================================================================
// VALIDATION PACKAGE
// ===============================================================================

function validatePutPkg(entry_type) {return null}
function validateModPkg(entry_type) { return null}
function validateDelPkg(entry_type) { return null}
function validateLinkPkg(entry_type) { return null}
