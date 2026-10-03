/* The starter pack: three scenarios the host can run with no sign-in and no
   network. Each one has three liar roles, six table roles and three twists;
   when a table is bigger than the named roles allow, the fillers below are
   dealt instead. Every objective is something a player does by talking — the
   app keeps the score, the table enforces the rest. */

window.LIARS_FILLERS = [
    {
        name: "A Guest Who Came Late",
        objective: "Watch the others and vote for whoever contradicts themselves first.",
        secret: "You missed the opening and nobody has told you what was decided.",
    },
    {
        name: "The Stranger",
        objective: "Say as little as you can get away with, and never explain why you are here.",
        secret: "Nobody at this table knows your real name.",
    },
    {
        name: "The Neighbour",
        objective: "Keep the peace. You may accuse one person, but only once.",
        secret: "You have a reason to be here that you have not said out loud.",
    },
];

window.LIARS_PACK = [
    {
        title: "The Midnight Ferry",
        premise:
            "A storm has pinned the last river ferry to the bank, and the crossing will not open before dawn. There is a crate in the hold that nobody will claim, and the lantern rope was cut an hour ago. The table has to decide who among you put that crate on board — before the water does.",
        closing:
            "The captain lights the lantern again and reads the manifest aloud. Whoever owns the crate is named in front of everyone.",
        liars: [
            {
                name: "The Smuggler",
                objective: "Keep the crate in the hold shut, and make sure the vote lands on someone else.",
                secret: "You cut the lantern rope yourself, so nobody could read the hold.",
            },
            {
                name: "The Ferryman's Nephew",
                objective: "Protect the crate by casting doubt on the captain's eyesight and his memory.",
                secret: "You were paid at the dock to look the other way for one night.",
            },
            {
                name: "The Quiet Widow",
                objective: "Steer the table towards the doctor, and never speak first.",
                secret: "The manifest is sewn into the hem of your coat.",
            },
        ],
        table: [
            {
                name: "The Captain",
                objective: "Find who cut the rope. You may put one question to any player each round.",
                secret: "You saw the nephew leave the deck a little after midnight.",
            },
            {
                name: "The Doctor",
                objective: "Keep the passengers calm — if the table panics, you lose with them.",
                secret: "Your bag holds a scalpel, forty marks and no medicine.",
            },
            {
                name: "The Schoolteacher",
                objective: "Take notes out loud: say who accused whom before each vote.",
                secret: "You are travelling under a name that is not yours.",
            },
            {
                name: "The Priest",
                objective: "Nobody may tell you the same story twice. If they do, say so.",
                secret: "You heard the widow praying about a crate.",
            },
            {
                name: "The Orphan",
                objective: "You may ask anyone one question, but you must answer theirs.",
                secret: "You took bread from the doctor's bag.",
            },
            {
                name: "The Mate",
                objective: "Guard the hold. Once tonight you may veto an accusation outright.",
                secret: "You owe the smuggler money you cannot pay.",
            },
        ],
        twists: [
            "A wave takes the lantern clean off its hook and the deck goes dark. Somewhere along the rail, somebody moves.",
            "The crate knocks twice from inside the hold. Everyone heard it. Nobody admits to hearing it.",
            "Dawn is an hour off, the ferry is still two miles from the bank, and the engine has started coughing.",
        ],
    },
    {
        title: "Closing Night at the Vine",
        premise:
            "It is the last service at the Vine, and the kitchen is falling apart around you: the stock is ruined, a bottle has vanished and the front door has been locked from the outside with the guests still at their tables. The table has to name whoever is doing this before the last course goes out.",
        closing:
            "The kitchen lights come back on and the owner reads the night's order slips aloud. One of them is a lie.",
        liars: [
            {
                name: "The Sous-Chef",
                objective: "Get the head chef blamed for the whole night, and never touch a pan yourself.",
                secret: "You salted the stock twice, on purpose, before service.",
            },
            {
                name: "The Sommelier",
                objective: "Make the waiter look like a thief, and keep the cellar out of it.",
                secret: "The missing bottle is in your locker, behind your coat.",
            },
            {
                name: "The Food Critic",
                objective: "Write the review in your head and get the table to agree with it out loud.",
                secret: "You are not a critic. You have never written a review in your life.",
            },
        ],
        table: [
            {
                name: "The Head Chef",
                objective: "Send one perfect plate. You may demand one ingredient back from anyone.",
                secret: "You know the stock was salted, and you know it was not you.",
            },
            {
                name: "The Waiter",
                objective: "Once tonight you may move an accusation from one player onto another.",
                secret: "You watched the sommelier leave the cellar with a bottle.",
            },
            {
                name: "The Dishwasher",
                objective: "You hear everything. You may repeat one sentence word for word.",
                secret: "You found a cork in the drain and kept it in your pocket.",
            },
            {
                name: "The Owner",
                objective: "Keep the night profitable. You may cancel one round of talk.",
                secret: "You are selling the Vine tomorrow morning.",
            },
            {
                name: "The Regular",
                objective: "You may ask anyone to give their order again, and they must.",
                secret: "You have eaten here every Friday for eleven years.",
            },
            {
                name: "The Pianist",
                objective: "Play through any argument. In the first round, nobody may vote for you.",
                secret: "You are playing for free tonight, and nobody knows.",
            },
        ],
        twists: [
            "The dining-room lights flicker twice and the ovens go out together.",
            "A plate comes back to the kitchen untouched, with a folded note underneath it.",
            "Someone tries the front door from the outside. It does not open, and the knocking stops.",
        ],
    },
    {
        title: "The Village of Ash",
        premise:
            "The mill burned last night and the village has gathered in the square to name whoever lit it. The wind keeps turning and bringing the smell back, and the miller is standing right there, saying nothing. The table has to decide before the meeting breaks up on its own.",
        closing:
            "The Elder rings the mill bell and reads the letter aloud. The square goes quiet.",
        liars: [
            {
                name: "The Miller's Rival",
                objective: "Get the village to blame the miller, and offer no alibi of your own.",
                secret: "You were seen walking past the mill at dusk, and you know it.",
            },
            {
                name: "The Nightwatch",
                objective: "Keep the cause of the fire unexplained for as long as you can.",
                secret: "You were on watch, and you looked away on purpose.",
            },
            {
                name: "The Tinker",
                objective: "Sell your story to whoever asks, and change it a little each time.",
                secret: "You sold the miller a lamp yesterday and never asked what it was for.",
            },
        ],
        table: [
            {
                name: "The Miller",
                objective: "Clear your name. You may demand one alibi from any player.",
                secret: "You were asleep in the mill house, and nobody can prove it.",
            },
            {
                name: "The Midwife",
                objective: "Once tonight you may silence one player for a whole round.",
                secret: "You were awake at dusk, delivering a child two lanes away.",
            },
            {
                name: "The Blacksmith",
                objective: "You may forbid one accusation; it has to be made again properly.",
                secret: "Your hammer is missing from the rack.",
            },
            {
                name: "The Baker",
                objective: "Feed the table. While you are speaking, nobody may accuse you.",
                secret: "You kept the mill's flour in your own cellar.",
            },
            {
                name: "The Elder",
                objective: "You decide ties, and you may ask one question nobody may refuse.",
                secret: "You have a letter from the miller's rival in your coat.",
            },
            {
                name: "The Child",
                objective: "You may ask one question that nobody is allowed to dodge.",
                secret: "You saw a lantern moving in the mill window after dark.",
            },
        ],
        twists: [
            "The wind turns and the smell of smoke comes back over the square.",
            "Someone finds a lantern in the ditch with the glass still warm.",
            "The mill's bell rope has been cut, so this meeting cannot be ended by ringing it.",
        ],
    },
];
