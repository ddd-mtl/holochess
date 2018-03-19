'use strict';

// ===============================================================================
// CONST
// ===============================================================================

var APP_ID = App.DNA.Hash;
var ME     = App.Key.Hash;

var SOURCE_AS_HASH = true;

// NOT USED YET
// var GAME_MAX_FULLMOVE     = 300; // arbitrary limit to game size - 
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
 *  return array of handle_links with Agent's hash as key
 */ 
function getAllHandles() 
{
  var linkArray = getEntriesFromLinks(APP_ID, "player", SOURCE_AS_HASH);
  return (linkArray? linkArray : []);
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
  debug("getHandle: " + agentHash);
  // FIXME : check valid agentHash?
  var linkArray = getEntriesFromLinks(agentHash, "handle");
  if(!linkArray || linkArray.length != 1)
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
 *  Create a Move Entry
 */ 
function commitMove(move)
{
  if(!move)
  {
    return null;
  }
  debug("new move on game: "+ move.gameHash + "\n\t san: " + move.san + " | " + move.index);

  // Build and commit move entry to my source chain  
  var moveHash = commit('move', move);
  debug("\tmove hash: " + moveHash);
  // On the DHT, put a link on the challenge's hash to the new move.
  commit("move_links", {Links:[{Base:move.gameHash,Link:moveHash,Tag:"halfmove"}]});
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
    debug("\t " + i + ". " + move.Entry.san + " | " + move.Entry.index); 
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
 *  return array of entries of challenges that corresponds to query parameters
 *  sorted by timestamp
 */ 
function getMyGames(/* stateMask, challengerHash, challengeeHash */)
{
  debug("getMyGames:");
  // getLinks from DHT
  var initiatedChallenges = getEntriesFromLinks(ME, "initiated");
  var receivedChallenges = getEntriesFromLinks(ME, "received");
  debug("\t Initiated: " + initiatedChallenges.length + "  received: " + receivedChallenges.length);
  
  var myGames = initiatedChallenges.concat(receivedChallenges);

  // Sort by timestamp
  myGames.sort(function (a, b) {return b.Entry.timestamp - a.Entry.timestamp;} );

  return myGames;
}


// ==============================================================================
// HELPERS: unexposed functions
// ==============================================================================


// helper function to determine if value returned from holochain function is an error
function hasErrorOccurred(result) 
{
  return ((typeof result === 'object') && result.name == "HolochainError");
}


/**
 * Helper for the "getLinks" with load call. 
 * Handle the no-link error case. 
 * Copy the returned entry values into a nicer array
 " @param canSourceBeHash if TRUE attribute Hash will be hash of the Source
 */
function getEntriesFromLinks(base, tag, canSourceBeHash) 
{
  debug("getEntriesFromLinks: " + base + " | tag : " + tag + " | " + canSourceBeHash);   
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
  debug("\t" + JSON.stringify(miniLinkArray));
  return miniLinkArray;
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
    debug("getHashsFromLinks failed: " + base + " | tag : " + tag);    
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

// GENESIS - Called only when your source chain is generated:'hc gen chain <name>'
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


// -----------------------------------------------------------------
//  VALIDATION functions for every DHT entry change
// -----------------------------------------------------------------

/**
 * Validate Challenge Entry
 * @return {boolean} success
 */
function validateChallenge(entry, header, pkg, sources)
{
  // FIXME challenger equals Source
  
  // Opponent MUST be different from challenger
  if(entry.challenger === entry.challengee)
  {
    debug("Challenge not valid because challenger and challengee are same.");
    return false;
  }

  // FIXME challengee is valid Agent Hash

  ////return validate('challenge', entry, header, pkg, sources);
  
  return true;
}


/**
 * Called only when your source chain is generated
 * @return {boolean} success
 */
function validateMove(entry, header, pkg, sources)
{
  // FIXME check game exists
  // FIXME check SAN string
  // FIXME check chess move
  ////return validate('move', entry, header, pkg, sources);
  return true;
}


/**
 * 
 */
function validateLink(linkEntryType, baseHash, links, pkg, sources)
{
  debug("validate link: " + linkEntryType);
  // FIXME
  return true; 
}


/**
 *  Commit validation dispatcher
 */
function validateCommit(entryType, entry, header, pkg, sources)
{
  debug("validate commit: " + entryType);
  switch (entryType)
  {
    case 'challenge':
      return validateChallenge(entry, header, pkg, sources);
    case 'move':
      return validateMove(entry, header, pkg, sources);      
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
    case 'challenge':
      return validateChallenge(entry, header, pkg, sources);
    case 'move':
      return validateMove(entry, header, pkg, sources); 
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
  debug("validate mod: " + entryType+" header:"+JSON.stringify(header)+" replaces:"+JSON.stringify(replaces));

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
function validateDel(entryName,hash, pkg, sources)
{
  debug("validate del: "+entry_type);  
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
