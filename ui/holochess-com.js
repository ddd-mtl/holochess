var Me             = null;
var g_Handle       = null;
var g_Handles      = {};
var g_Users        = {};
var g_ActivePlayer = null;

// Holochain UI library

// use send to make an ajax call to your exposed functions
function hc_send(fn, data, resultFn) 
{
  console.log("calling: " + fn + " with " + JSON.stringify(data));
  $.post(
      "/fn/Holochess/" + fn,
      data,
      function(response) 
      {
          console.log("\tresponse: " + response);
          resultFn(response);
      }
  ).fail(function(response)
   {
      console.log("\tresponse failed: " + response.responseText);
  })
  ;
};

//============================================================================


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

function getMyHandle() 
{
  getHandle(Me, function (handle)
  {
      Handle = handle;
      $("#handle").html(handle);
  });
}

function getProfile() 
{
  hc_send("getMyHash", undefined, function(me)
  {
      Me = me;
      getMyHandle();
      $("#playerid").html(me);
  });
}

//============================================================================


function selectPlayer(event) 
{
  $("#players li").removeClass("selected-player");
  ActivePlayer = $(this).data('id');
  setActivePlayer();
}

function setActivePlayer()
{
  var elem = $("#players li[data-id=" + g_ActivePlayer + "]");
  $(elem).addClass("selected-player");
  $("#games-header").text("Games with " + $(elem).data("name"));
  // loadHistory();
}

// 
function commitChallenge() 
{
  if (!g_ActivePlayer) 
  {
      alert("pick a player first!");
      return;
  }
  hc_send("commitChallenge", 
          JSON.stringify({ "opponent": g_ActivePlayer, "challengerPlaysWhite": true, "isGamePublic": true }),  // FIXME
          function(result)
          {
              result = JSON.parse(result);
              console.log("Challenge Hashkey: " + result);
          }
        );  
}

//============================================================================

// Add behavior to HTML
$(window).ready(function () 
{
  // $("#handle").on("click", "", openSetHandle);
  // $('#setHandleButton').click(doSetHandle);
  $("#players").on("click", "li", selectPlayer);
  $("#challenge-button").click(commitChallenge);
  getProfile();
  // setInterval(getHandles, 2000);
});