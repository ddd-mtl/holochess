'use strict';

// global const
var APP_ID = App.DNA.Hash;
var ME     = App.Key.Hash;

var GAME_MAX_FULLMOVE     = 300; // arbitrary limit to game size

var GAME_STATE_NULL               = 1 << 0;
var GAME_STATE_CHALLENGE_PENDING  = 1 << 1;
var GAME_STATE_ACTIVE             = 1 << 2;
var GAME_STATE_FINISHED_WHITE_WIN = 1 << 3;
var GAME_STATE_FINISHED_BLACK_WIN = 1 << 4;
var GAME_STATE_FINISHED_DRAW      = 1 << 5;

var SOURCE_AS_HASH = true;

// ==============================================================================
// EXPOSED Functions: visible to the UI, can be called via localhost, web browser, or socket
// ===============================================================================

/**
 *  return value of requested property
 */ 
function getAppProperty(name)
{            
  if (name == "App_Agent_Hash")   { return App.Agent.Hash; }
  if (name == "App_Agent_String") { return App.Agent.String; }
  if (name == "App_Key_Hash")     { return App.Key.Hash; }
  if (name == "App_DNA_Hash")     { return App.DNA.Hash; }
  return ("Error: No App Property with name: " + name);
}


// HANDLES / AGENT
// ==============================================================================

/** 
 * return this agent's hashkey
 */
function getMyHash()
{
  return ME;
}


/**
 * Set new handle for self. 
 * Might replace previous handle if there is one.
 * FIXME handle: must be valid handle (alphanum?), and different from current
 * return new handle hashkey
 */
function commitNewHandle(handle)
{
  // get all agent's previous handles
  var handles = getHashsFromLinks(ME, "handle");

  var n = handles.length - 1;
  if (n < 0)
  {
    // No previous handle found
    return commitFirstHandle(handle);    
  }

  // Agent has previous handles.
  // Update previous handle
  var previousHandleHashkey = handles[n];
  var newHandleHashkey      = update("handle", handle, previousHandleHashkey);

  debug("new handle: " + handle + " is " + newHandleHashkey);
  debug("old handle: was " + previousHandleHashkey);

  // Update links to previous handle
  commit("handle_links",
          {Links:[
              {Base:ME, Link:previousHandleHashkey, Tag:"handle", LinkAction:HC.LinkAction.Del},
              {Base:ME, Link:newHandleHashkey, Tag:"handle"}
          ]});
  commit("directory_links",
          {Links:[
              {Base:APP_ID, Link:previousHandleHashkey, Tag:"player", LinkAction:HC.LinkAction.Del},
              {Base:APP_ID, Link:newHandleHashkey, Tag:"player"}
          ]});

  return newHandleHashkey;  
}


/**
 *  return array of user keys to handles
 */ 
function getAllHandles() 
{
  // if (property("enableDirectoryAccess") != "true") 
  // {
  //     return undefined;
  // }
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
function getHandle(agentHashkey)
{
  debug("getHandle: " + agentHashkey);
  // FIXME : check valid agentHashkey?
  var linkArray = getEntriesFromLinks(agentHashkey, "handle");
  if(!linkArray || linkArray.length != 1)
  {
    return [];
  }
  return linkArray[0].Entry;
}


/**
 *  return array of user keys to handles
 */ 
function getAllPlayers() 
{
  // if (property("enableDirectoryAccess") != "true") 
  // {
  //     return undefined;
  // }
  return getEntriesFromLinks(APP_ID, "player", SOURCE_AS_HASH);
}


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
  debug("commitChallenge jsonMsg: "+ JSON.stringify(challenge));

  challenge.challenger = ME;
  
  // commit challenge entry to my source chain
  var challengeHashkey = commit('challenge', challenge);

  debug("new challenge: "+ challengeHashkey + "\n\t challenger: " + ME + "\n\t opponent  :" + challenge.opponent);

  // On the DHT, put a link on my hashkey, and my opponents hashkey, to the new challenge.
  commit("challenge_links", {Links:[{Base:ME,Link:challengeHashkey,Tag:"challenger"}]});
  commit("challenge_links", {Links:[{Base:challenge.opponent,Link:challengeHashkey,Tag:"challengee"}]});
  return challengeHashkey;
}


/**
 *  Create a Challenge Entry
 */ 
function commitMove(move)
{
  if(!move)
  {
    return null;
  }
  debug("new move on game: "+ move.gameHash + "\n\t san: " + move.san + " | " + move.index);

  // Build and commit move entry to my source chain  
  var moveHashkey = commit('move', move);
  debug("\tmove hashkey: " + moveHashkey);
  // On the DHT, put a link on the challenge's hashkey to the new move.
  commit("move_links", {Links:[{Base:move.gameHash,Link:moveHashkey,Tag:"halfmove"}]});
  return moveHashkey;
}


/**
 *  return array of all moves of a game, in SAN strings
 */ 
function getMoves(gameHashkey)
{
  // getLinks from DHT
  var moves = getEntriesFromLinks(gameHashkey, "halfmove");
  debug("getMoves of game: " + gameHashkey + "\n\t moves found: " + moves.length);

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
 * Load Challenge from hashkey
 * return null if requested entry is not 'challenge' type 
 */
function getChallenge(entryHashkey)
{
  debug("getChallenge called: " + entryHashkey);  
  var challenge = get(entryHashkey);
  debug("Challenge: " + challenge);
  return JSON.parse(challenge);
  //return challenge;
}


/**
 *  return list of hash of games that corresponds to query
 */ 
//// function getGamesBy(stateMask, challenger, opponent)
function getMyGames()
{
  debug("getMyGames:");
  // getLinks from DHT
  var challengerLinks = getHashsFromLinks(ME, "challenger");
  var challengeeLinks = getHashsFromLinks(ME, "challengee");
  debug("\t Initiated: " + challengerLinks.length + "  received: " + challengeeLinks.length);
  
  var challengeLinks = challengerLinks.concat(challengeeLinks);
  return challengeLinks;
}


// ==============================================================================
// HELPERS: unexposed functions
// ==============================================================================

// commit first time handle and its links on the directory
function commitFirstHandle(handle) 
{
  // TODO confirm no collision
   // On my source chain, commit a new handle entry
  var hashkey = commit("handle", handle);

  debug(handle + " stored at " + hashkey);

  // On DHT, set links to my handle
  commit("handle_links", {Links:[{Base:ME,Link:hashkey,Tag:"handle"}]});
  commit("directory_links", {Links:[{Base:APP_ID,Link:hashkey,Tag:"player"}]});

  return hashkey;
}


// helper function to determine if value returned from holochain function is an error
function hasErrorOccurred(result) 
{
  return ((typeof result === 'object') && result.name == "HolochainError");
}


/**
 * Helper for the "getLinks" with Load call. 
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
 * Helper for the "getLinks" without Load call. 
 * Handle the no links entry error
 * Build a simpler links array
 */
function getHashsFromLinks(base, tag) 
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
  commitFirstHandle(App.Agent.String);
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
  if(entry.challenger === entry.opponent)
  {
    debug("Challenge not valid because challenger and opponent are same.");
    return false;
  }

  // FIXME opponent is valid Agent Hash

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


function validateLink(linkEntryType, baseHash, links, pkg, sources)
{
  debug("validate link: " + linkEntryType);
  // FIXME
  return true; 
}


// Dispatcher
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

// TODO: Add 'challenge accepted' flag
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

// TODO: Possibility to remove challenge if it has not been accepted
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
