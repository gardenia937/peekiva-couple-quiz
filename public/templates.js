/* ============================================================
   Peekiva Couple Quiz — preset templates (real, usable content).
   To edit questions: change text/options below, redeploy frontend.
   Types: "choice" (2-6 options) | "yesno" | "short".
   ============================================================ */
window.PEEKIVA_TEMPLATES = [
  {
    id: "know-me",
    title: "How Well Do You Know Me?",
    blurb: "The classic. Ten little tests of how closely they've been paying attention.",
    questions: [
      { type: "choice", text: "What would I choose for a perfect weekend?", options: ["Sleeping in and ordering takeout", "A spontaneous road trip", "Brunch and wandering the city", "Staying in with a good show"] },
      { type: "choice", text: "What is my biggest pet peeve?", options: ["People being late", "Loud chewing", "A messy space", "Small talk"] },
      { type: "choice", text: "What would I probably spend too much money on?", options: ["Skincare and candles", "Sneakers or streetwear", "Books I swear I'll read", "Fancy coffee"] },
      { type: "choice", text: "What makes me feel most appreciated?", options: ["A long hug", "A thoughtful little note", "Them handling something for me", "Quality time, phones away"] },
      { type: "choice", text: "What is something I secretly love?", options: ["Reality TV", "Naps that run too long", "Online window shopping", "Scrolling through old photos"] },
      { type: "choice", text: "What is one thing I could never live without?", options: ["My phone", "Music", "My best friend", "Dessert"] },
      { type: "choice", text: "Pick my ideal date night.", options: ["Cooking together at home", "A cozy little restaurant", "Stargazing somewhere quiet", "A concert or live show"] },
      { type: "choice", text: "How do I act when I'm stressed?", options: ["I go quiet", "I vent about everything", "I keep myself busy", "Snack first, talk later"] },
      { type: "yesno", text: "Do I check my phone first thing in the morning?" },
      { type: "short", text: "What is one thing you think I need to hear right now?" }
    ]
  },
  {
    id: "compatibility",
    title: "Couple Compatibility",
    blurb: "Are you two running the same operating system? Let's find out.",
    questions: [
      { type: "choice", text: "Our ideal Friday night is…", options: ["Cooking together", "Going out with friends", "A full movie marathon", "Trying somewhere new"] },
      { type: "choice", text: "When we disagree, we usually…", options: ["Talk it out right away", "Need some space first", "Laugh it off", "Text about it later"] },
      { type: "choice", text: "Who takes longer to get ready?", options: ["Me, obviously", "Them, obviously", "We're equally slow", "We're both always ready"] },
      { type: "choice", text: "Our dream trip together would be…", options: ["A beach with no plans", "A city full of museums and food", "Mountains and a cabin", "A road trip with a loose plan"] },
      { type: "yesno", text: "Do we text each other good morning every day?" },
      { type: "choice", text: "Who is more likely to pick the restaurant?", options: ["Me", "Them", "We argue until someone gives in", "We have a go-to place"] },
      { type: "choice", text: "What matters more in our relationship?", options: ["Endless laughter", "Deep conversations", "Little everyday gestures", "Big romantic moments"] },
      { type: "yesno", text: "Have we ever argued about directions while traveling?" },
      { type: "short", text: "What is one small thing we should do more often together?" }
    ]
  },
  {
    id: "deep-dive",
    title: "Relationship Deep Dive",
    blurb: "A little deeper than small talk. Nothing scary — just honest.",
    questions: [
      { type: "choice", text: "When do you feel closest to me?", options: ["Late-night talks", "Doing nothing together", "When we laugh at the same thing", "When we're working through something hard"] },
      { type: "short", text: "What is something you've been meaning to tell me?" },
      { type: "choice", text: "What do you think I need most right now?", options: ["More rest", "More fun", "More reassurance", "More space to vent"] },
      { type: "yesno", text: "Do you feel like I really listen when it matters?" },
      { type: "choice", text: "What would make our everyday life better?", options: ["A shared routine", "More date nights", "Less phone time", "A small adventure each month"] },
      { type: "short", text: "What is your favorite memory of us so far?" },
      { type: "choice", text: "How do you want to handle our next disagreement?", options: ["Talk it out the same day", "Sleep on it, then talk", "Write it down first", "Ask what the other needs"] },
      { type: "short", text: "What would you change about our relationship, if anything?" }
    ]
  },
  {
    id: "fun",
    title: "Fun Couple Questions",
    blurb: "Silly, unserious, and weirdly revealing. Best played with snacks.",
    questions: [
      { type: "choice", text: "Who would survive longer on a deserted island?", options: ["Me", "Them", "We'd both thrive", "We'd both be done by day two"] },
      { type: "choice", text: "Who is the better driver? (Be honest.)", options: ["Me", "Them", "Neither of us, really", "We both think it's us"] },
      { type: "choice", text: "If we swapped phones for a day, who would panic first?", options: ["Me", "Them", "Both of us immediately", "Neither — we're chill"] },
      { type: "yesno", text: "Have you ever stolen fries off my plate and denied it?" },
      { type: "choice", text: "Who controls the aux on a road trip?", options: ["Me", "Them", "We take turns", "Whoever is driving"] },
      { type: "choice", text: "What is our couple superpower?", options: ["Finding great food anywhere", "Making each other laugh", "Napping in sync", "Remembering song lyrics"] },
      { type: "yesno", text: "Would you trust me to cut your hair?" },
      { type: "short", text: "Give our relationship a movie title." }
    ]
  },
  {
    id: "remember-us",
    title: "How Well Do You Remember Us?",
    blurb: "Firsts, favorites, and tiny details. Time to prove you were paying attention.",
    questions: [
      { type: "short", text: "Where did we go on our first date?" },
      { type: "choice", text: "What was I wearing when we first met? (Your best guess counts.)", options: ["Something black", "Something colorful", "Jeans and a nice top", "Honestly, no idea"] },
      { type: "short", text: "What was the first meal we ever shared?" },
      { type: "choice", text: "What song reminds you of us?", options: ["The one we always sing", "Our road trip anthem", "That song from that night", "We don't have one yet"] },
      { type: "yesno", text: "Do you remember what we talked about on our first call?" },
      { type: "short", text: "What is the funniest thing that has happened to us together?" },
      { type: "choice", text: "Where would I want to go for our next anniversary?", options: ["Back where it started", "Somewhere we've never been", "A quiet night in", "A big night out"] },
      { type: "short", text: "What is one tiny moment with me you'd never want to forget?" }
    ]
  },
  {
    id: "never-ask",
    title: "Questions We Never Ask",
    blurb: "The ones you think about but never say out loud. Until now.",
    questions: [
      { type: "short", text: "What is something you've always wanted to ask me but never did?" },
      { type: "choice", text: "Is there something small I do that bothers you more than you admit?", options: ["Leaving things around", "Being on my phone", "Running late", "Nothing — you're perfect (sure)"] },
      { type: "yesno", text: "Have you ever pretended to like something just because I liked it?" },
      { type: "short", text: "What do you wish I understood better about you?" },
      { type: "choice", text: "What are you most afraid of in a relationship?", options: ["Being misunderstood", "Growing apart quietly", "Losing the spark", "Not being enough"] },
      { type: "yesno", text: "Do you think we tell each other everything?" },
      { type: "short", text: "What is one thing I do that makes you feel truly loved?" },
      { type: "short", text: "If we could change one habit as a couple, what would it be?" }
    ]
  },
  {
    id: "just-for-us",
    title: "Just For Us",
    blurb: "Soft, sweet, and just between the two of you.",
    questions: [
      { type: "choice", text: "What is your favorite way to spend a slow morning with me?", options: ["Coffee in bed", "A walk with no destination", "Cooking breakfast together", "Doing absolutely nothing"] },
      { type: "short", text: "What is the sweetest thing I've ever done for you?" },
      { type: "choice", text: "When do I look my best? (Flattery encouraged.)", options: ["Laughing at something dumb", "All dressed up", "Half asleep, honestly", "Always. Next question."] },
      { type: "yesno", text: "Do I make ordinary days feel special?" },
      { type: "short", text: "Describe us in three words." },
      { type: "choice", text: "What should our next little tradition be?", options: ["Sunday pancakes", "A monthly date night", "A yearly trip", "A nightly walk"] },
      { type: "short", text: "What are you most grateful for about us right now?" }
    ]
  },
  {
    id: "custom",
    title: "Make Your Own",
    blurb: "Start from a blank page. Your questions, your rules.",
    questions: [
      { type: "choice", text: "What should we do this weekend?", options: ["Stay in and relax", "Go out with friends", "Try something new", "Decide last minute"] }
    ]
  }
];
