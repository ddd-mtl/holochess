# holochess

WIP

## Intent

P2P chess game on Holochain as a learning project

## Features

Asynchronous chess games with no time limit

### Order of events

1. Challenge an Opponent

Send a challenge request to an opponent. Fields:
 - Challenger: Hash of challenger (can only be self)
 - Opponent: Hash of opponent
 - ChallengerPlaysWhite: Boolean - self-explanatory
 - isGamePublic: Boolean - if true, challenge and moves are published in the dht, otherwise each entries are local to players sources chains only.

 2. Opponent accepts challenge and plays first move (empty if opponent does not play white)

 3. Player sends chess move. Fields:
  - gameHash: Hash of challenge request
  - SAN: string of SAN chess move

  ...

  4. Player sends endgame move (in SAN)
   - Claim victory
   - Claims draw   
   - Declares forfeit

  5. Modify challenge to notify game is over and number of moves?


### Alternate order

Opponent must accept challenge, otherwise challenger can delete his challenge.


# DNA

## Main

Handle: Agent's name

Challenge: Chess game's initial challenge request

Move: Chess move



## Links

handle_links:

challenge_links: 
  - Links challenge to challenger, tag: "challengeInitiated"
  - Links challenge to opponent, tag: "challengeReceived"

move_links:
 - Links move to challenge, tag: "move"

directory_links: 
  - Links agent to directory, tag: ""

