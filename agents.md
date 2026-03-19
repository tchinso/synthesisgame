시작 콜을 100콜로 바꿔줘.
그리고 지금 게임 켰는데 뭐 아무것도 버튼이 안 떠. 일단 오류 정보를 여기다가 알려줄게
TypeError: Cannot read properties of undefined (reading 'Future')
    at Web of Trust.user.js:1765:30
    at Window.<anonymous> (Web of Trust.user.js:1784:2)
    at Web of Trust.user.js:1732:67
    at e.anonymous [as $content] (Web of Trust.user.js:1732:143)
    at Web of Trust.user.js:2:36447
    at o (Web of Trust.user.js:2:36049)
    at Web of Trust.user.js:2:36079
    at Web of Trust.user.js:2:36427
    at Web of Trust.user.js:14872:5
game.js:109 Uncaught ReferenceError: Cannot access 'state' before initialization
    at game.js:109:51
    at Array.every (<anonymous>)
    at allQuestIdsCompleted (game.js:109:14)
    at conditionMet (game.js:118:14)
    at Array.every (<anonymous>)
    at game.js:143:84
    at Array.forEach (<anonymous>)
    at hydrateProgress (game.js:142:11)
    at loadState (game.js:41:5)
    at game.js:34:13
