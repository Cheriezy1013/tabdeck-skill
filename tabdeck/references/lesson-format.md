# Writing the daily lessons (lessons.json)

TabDeck shows one 3-minute lesson a day on the new-tab page. You write them for the person, from what they told you they are learning. The build script checks the shape and refuses to build if anything is off.

## Shape

```json
{
  "topics": {
    "korean": {
      "label": "Korean 한국어",
      "short": "Korean",
      "voice": "ko-KR",
      "items": [
        {
          "title": "Hello, thank you, yes and no",
          "phrases": [
            ["안녕하세요", "annyeonghaseyo", "Hello"],
            ["감사합니다", "gamsahamnida", "Thank you"],
            ["네 / 아니요", "ne / aniyo", "Yes / No"]
          ],
          "tryit": "Greet the next person you meet with 안녕하세요 in your head, then out loud.",
          "quiz": { "q": "How do you say “thank you”?", "opts": ["감사합니다", "안녕하세요", "아니요"], "a": 0 }
        }
      ]
    }
  }
}
```

- **Topic key**: lowercase letters, digits or dashes (`korean`, `excel-basics`, `photography`). Up to 3 topics; the person switches between them with buttons. One topic is usually best.
- **label**: shown on the lesson card. **short**: one word for "Today's 3-minute ___". **voice**: a BCP-47 tag for read-aloud (`ko-KR`, `ja-JP`, `es-ES`, `zh-CN`, `ms-MY`, `ta-IN`, `fr-FR`, `en-US`...). For a non-language topic use `en-US` or `en-GB`.
- **items**: at least 5 lessons, 7 is best (one per weekday cycle). Lessons rotate by date, so lesson 1 can come back after the last one.
- **phrases**: 2-4 rows of exactly three texts: `[main thing, how to say it or a tiny example, what it means]`. The first text is what read-aloud speaks.
  - Language: `[native script, romanisation, English meaning]`.
  - Skill (Excel, investing, photography, design...): `[term or shortcut, a short example, what it does]`, e.g. `["XLOOKUP", "=XLOOKUP(A2, B:B, C:C)", "Finds A2 in column B and returns the match from C"]`.
- **tryit**: one small thing to do today, under 20 words.
- **quiz**: `q`, 2-4 `opts`, `a` = the index (0-based) of the right option. The warm-up on the next day reuses yesterday's quiz.

## Writing rules

- Pitch it at the person's level (they told you: beginner, some basics, or intermediate). Lesson 1 is the easiest; build up across the week.
- Each lesson fits in 3 minutes: three phrases, one try-it, one question.
- Be accurate. For languages, use standard spelling and a common romanisation (Revised Romanization for Korean, Hepburn for Japanese, Hanyu Pinyin with tone marks for Mandarin). If you are not sure a phrase is natural, choose a simpler one you are sure of.
- Connect it to their life where you can: if they said they're going to Japan in December, lesson topics can follow the trip (airport, food, directions).
- Write your own content. Do not copy textbook pages, song lyrics or other copyrighted text.
- No emoji inside phrases (read-aloud would speak them).
