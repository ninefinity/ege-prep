# -*- coding: utf-8 -*-
"""Regenerate data/reading-skills.json for the task-39 reading-aloud drill.

OVERWRITES the data file: this table is the source of truth for the deck, not
the JSON. Edit here and re-run; hand edits to the JSON are lost on the next run.

    python3 scripts/build_reading_skills.py

Each word is (text, syllable-split, stressed-syllable index, IPA, note, extras).
The split is written with "|" between syllables; joined it must equal the word
(hyphens ignored). `stress` indexes that split and, together with the ˈ mark
required in `ipa` for anything polysyllabic, is what the tests use to catch a
mistranscribed word -- neither is rendered on the card.

extras: sense (a short tag -- "noun", "past tense" -- shown right after the
word, only where two cards share a spelling and need distinguishing, e.g. the
two "Record" cards or the two "Live" cards).
"""
import collections
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.paths import TOPIC_FILES

DECKS = []

INSTRUCTIONS = "Read the word aloud, then listen and compare."


def deck(did, nav, title, instructions, words):
    DECKS.append((did, nav, title, instructions, words))

def w(text, split, stress, ipa, note, **extras):
    return (text, split, stress, ipa, note, extras)

# ─────────────────────────────────────────── 1. silent letters & digraphs
deck("skills39-silent-letters", "Silent letters & digraphs", "Letters you never say",
     INSTRUCTIONS, [
 w("Whine", "Whine", 0, "/waɪn/", "⟨wh-⟩ is simply /w/ — the h is silent, and it stays /w/, not /v/."),
 w("Christmas", "Christ|mas", 0, "/ˈkrɪsməs/", "The ⟨t⟩ inside ⟨-stm-⟩ is silent."),
 w("Chemicals", "Chem|i|cals", 0, "/ˈkemɪkəlz/", "Greek ⟨ch⟩ is /k/, never /tʃ/."),
 w("Headaches", "Head|aches", 0, "/ˈhedeɪks/", "⟨ea⟩ is short /e/ and ⟨ch⟩ is /k/."),
 w("Wrinkles", "Wrin|kles", 0, "/ˈrɪŋkəlz/", "⟨wr-⟩ opens with a plain /r/ — the w is silent."),
 w("Muscles", "Mus|cles", 0, "/ˈmʌsəlz/", "The ⟨c⟩ is silent: /ˈmʌsəlz/, never /ˈmʌskəlz/."),
 w("Ancient", "An|cient", 0, "/ˈeɪnʃənt/", "⟨a⟩ is the diphthong /eɪ/ and ⟨ci⟩ is /ʃ/."),
 w("Species", "Spe|cies", 0, "/ˈspiːʃiːz/", "⟨ci⟩ is /ʃ/, and singular and plural sound identical."),
 w("Symptoms", "Symp|toms", 0, "/ˈsɪmptəmz/", "Greek ⟨y⟩ is short /ɪ/; hold /mpt/ together with no vowel inside."),
 w("Disease", "Dis|ease", 1, "/dɪˈziːz/", "Both ⟨s⟩ letters are voiced /z/, and the stress is on the second syllable."),
 w("Psychology", "Psy|chol|o|gy", 1, "/saɪˈkɒlədʒi/", "Silent ⟨p⟩ in ⟨ps-⟩, and ⟨ch⟩ is /k/."),
 w("Technologies", "Tech|nol|o|gies", 1, "/tekˈnɒlədʒiz/", "⟨ch⟩ is /k/, and the stress sits on ⟨-nol-⟩, not the first syllable."),
 w("Anxiety", "An|xi|e|ty", 1, "/æŋˈzaɪəti/", "⟨x⟩ is voiced here — /ŋz/, not /ks/."),
 w("Characteristics", "Char|ac|ter|is|tics", 3, "/ˌkærəktəˈrɪstɪks/", "⟨ch⟩ is /k/, and the main stress falls late, on ⟨-is-⟩."),
])

# ────────────────────────────────────────── 2. deceptive vowels & syncope
deck("skills39-deceptive-vowels", "Deceptive vowels & syncope", "Vowels that lie",
     INSTRUCTIONS, [
 w("Camel", "Cam|el", 0, "/ˈkæməl/", "⟨a⟩ is short /æ/, not /eɪ/."),
 w("Bushy", "Bush|y", 0, "/ˈbʊʃi/", "⟨u⟩ is /ʊ/ as in put, not /ʌ/ as in cup."),
 w("Buried", "Bur|ied", 0, "/ˈberid/", "⟨u⟩ is short /e/ — it rhymes with berried, not hurried."),
 w("Linen", "Lin|en", 0, "/ˈlɪnɪn/", "Both vowels are short and weak; there is no long /aɪ/."),
 w("Roam", "Roam", 0, "/rəʊm/", "⟨oa⟩ is the diphthong /əʊ/, not the long /uː/ of room."),
 w("Barren", "Bar|ren", 0, "/ˈbærən/", "Short /æ/ then a schwa; the doubled ⟨r⟩ adds nothing."),
 w("Fables", "Fa|bles", 0, "/ˈfeɪbəlz/", "⟨a⟩ is the diphthong /eɪ/, and ⟨-les⟩ closes as /-bəlz/."),
 w("Motive", "Mo|tive", 0, "/ˈməʊtɪv/", "Stress the first syllable; the ending is weak /-tɪv/, not /-taɪv/."),
 w("Climate", "Cli|mate", 0, "/ˈklaɪmət/", "The ending reduces to a schwa, /-mət/, not /-meɪt/."),
 w("Delicate", "Del|i|cate", 0, "/ˈdelɪkət/", "An adjective's ⟨-ate⟩ ending is weak /-ət/."),
 w("Surface", "Sur|face", 0, "/ˈsɜːfɪs/", "The second syllable weakens to /-fɪs/ — no face inside it."),
 w("Flourish", "Flour|ish", 0, "/ˈflʌrɪʃ/", "⟨ou⟩ is short /ʌ/ here, not /aʊ/."),
 w("Humid", "Hu|mid", 0, "/ˈhjuːmɪd/", "⟨u⟩ carries a /j/ glide: /hjuː-/, not /huː-/."),
 w("Vinegar", "Vin|e|gar", 0, "/ˈvɪnɪɡər/", "⟨i⟩ is short /ɪ/ — no /aɪ/ borrowed from vine."),
 w("Treasures", "Treas|ures", 0, "/ˈtreʒərz/", "⟨ea⟩ shortens to /e/, and ⟨s⟩ is the voiced /ʒ/."),
 w("Predators", "Pred|a|tors", 0, "/ˈpredətərz/", "Short /e/ in the first syllable, despite the /eɪ/ of prey."),
 w("Creature", "Crea|ture", 0, "/ˈkriːtʃər/", "⟨ea⟩ is long /iː/, and ⟨t⟩ + ⟨u⟩ fuse into /tʃ/."),
 w("Bicycles", "Bi|cy|cles", 0, "/ˈbaɪsɪklz/", "The two ⟨i⟩ letters differ: long /aɪ/, then weak /ɪ/."),
 w("Boundary", "Boun|da|ry", 0, "/ˈbaʊndri/", "The middle vowel drops — three written syllables, two spoken."),
 w("Chocolate", "Choc|o|late", 0, "/ˈtʃɒklət/", "Collapses to two syllables: /ˈtʃɒk-lət/."),
 w("Comfortable", "Com|for|ta|ble", 0, "/ˈkʌmftəbəl/", "The ⟨-or-⟩ vanishes: /ˈkʌmf-tə-bəl/."),
 w("Towards", "To|wards", 1, "/təˈwɔːdz/", "Weak /tə-/, then the stressed /-ˈwɔːdz/ — keep the /w/ audible."),
 w("Recreation", "Rec|re|a|tion", 2, "/ˌrekriˈeɪʃən/", "The prefix is /rek-/, not /riː-/, and the main stress is on ⟨-a-⟩."),
])

# ─────────────────────────────────────────────────── 3. consonant clusters
deck("skills39-consonant-clusters", "Consonant clusters", "Consonants with no rest",
     INSTRUCTIONS, [
 w("Gland", "Gland", 0, "/ɡlænd/", "Open on /ɡl-/ and close on /-nd/, with no vowel between g and l."),
 w("Wealth", "Wealth", 0, "/welθ/", "⟨ea⟩ is short /e/, then /l/ runs straight into /θ/."),
 w("Strength", "Strength", 0, "/streŋθ/", "Three consonants in /str-/, closing on /-ŋθ/."),
 w("Range", "Range", 0, "/reɪndʒ/", "⟨a⟩ is the diphthong /eɪ/, closing on /-ndʒ/."),
 w("Aspects", "As|pects", 0, "/ˈæspekts/", "The ending piles up /-kts/ — sound all three."),
 w("Detached", "De|tached", 1, "/dɪˈtætʃt/", "⟨-ed⟩ adds only /t/ here: /-tʃt/ stays one syllable."),
 w("Organism", "Or|gan|ism", 0, "/ˈɔːɡənɪzəm/", "Stress the first syllable; the ending is /-ɪzəm/ with a voiced /z/."),
 w("Particularly", "Par|tic|u|lar|ly", 1, "/pəˈtɪkjələli/", "Five syllables alternating /l/ and /r/ — keep them distinct."),
])

# ────────────────────────────────────────────────────── 4. lexical stress
deck("skills39-lexical-stress", "Lexical stress", "Where the weight falls",
     INSTRUCTIONS, [
 w("Amateur", "Am|a|teur", 0, "/ˈæmətər/", "Stress the first syllable; the French ending weakens to /-tər/."),
 w("Primitive", "Prim|i|tive", 0, "/ˈprɪmətɪv/", "Stress the first syllable; both later vowels reduce."),
 w("Developed", "De|vel|oped", 1, "/dɪˈveləpt/", "Stress the middle syllable, and ⟨-ed⟩ is only /t/."),
 w("Opponent", "Op|po|nent", 1, "/əˈpəʊnənt/", "Stress the middle syllable; the first reduces to a schwa."),
 w("Domestic", "Do|mes|tic", 1, "/dəˈmestɪk/", "Stress the middle syllable; the first is only a schwa."),
 w("Equator", "E|qua|tor", 1, "/ɪˈkweɪtər/", "Stress the middle syllable, on the diphthong /eɪ/."),
 w("Capacity", "Ca|pac|i|ty", 1, "/kəˈpæsəti/", "Stress the second syllable, on the short /æ/."),
 w("Variety", "Va|ri|e|ty", 1, "/vəˈraɪəti/", "Stress the second syllable, on the /aɪ/."),
 w("Society", "So|ci|e|ty", 1, "/səˈsaɪəti/", "Stress the second syllable; the first is only a schwa."),
 w("Environment", "En|vi|ron|ment", 1, "/ɪnˈvaɪrənmənt/", "Stress the second syllable, and keep the ⟨n⟩ before ⟨m⟩."),
 w("Domesticated", "Do|mes|ti|cat|ed", 1, "/dəˈmestɪkeɪtɪd/", "Five syllables with the stress on the second."),
 w("Purification", "Pu|ri|fi|ca|tion", 3, "/ˌpjʊərɪfɪˈkeɪʃən/", "Main stress on ⟨-ca-⟩, secondary on ⟨Pu-⟩, which carries a /j/ glide."),
])

# ───────────────────────────────── 5. heteronyms: one spelling, two sounds
deck("skills39-heteronyms", "Same spelling, two sounds", "One spelling, two sounds",
     INSTRUCTIONS, [
 w("Read", "Read", 0, "/riːd/", "Present tense takes the long /iː/. The past is /red/.", sense="present tense"),
 w("Read", "Read", 0, "/red/", "Past tense takes the short /e/ — it sounds like red.", sense="past tense"),
 w("Live", "Live", 0, "/lɪv/", "The verb has the short /ɪ/.", sense="verb"),
 w("Live", "Live", 0, "/laɪv/", "The adjective and adverb take the long /aɪ/.", sense="adjective"),
 w("Wind", "Wind", 0, "/wɪnd/", "The noun has the short /ɪ/.", sense="noun — moving air"),
 w("Wind", "Wind", 0, "/waɪnd/", "The verb takes the long /aɪ/.", sense="verb — to coil"),
 w("Tear", "Tear", 0, "/tɪər/", "The noun rhymes with here: /tɪər/.", sense="noun — from crying"),
 w("Tear", "Tear", 0, "/teər/", "The verb rhymes with hair: /teər/.", sense="verb — to rip"),
 w("Close", "Close", 0, "/kləʊz/", "The verb ends in the voiced /z/.", sense="verb"),
 w("Close", "Close", 0, "/kləʊs/", "The adjective ends in the voiceless /s/.", sense="adjective — near"),
 w("Use", "Use", 0, "/juːz/", "The verb ends in the voiced /z/.", sense="verb"),
 w("Use", "Use", 0, "/juːs/", "The noun ends in the voiceless /s/.", sense="noun"),
 w("Lead", "Lead", 0, "/liːd/", "The verb takes the long /iː/.", sense="verb — to guide"),
 w("Lead", "Lead", 0, "/led/", "The metal takes the short /e/ — it sounds like led.", sense="noun — the metal"),
 w("Minute", "Min|ute", 0, "/ˈmɪnɪt/", "The noun stresses the first syllable, with two short vowels.", sense="noun — sixty seconds"),
 w("Minute", "Mi|nute", 1, "/maɪˈnjuːt/", "The adjective moves the stress to the second syllable and lengthens both vowels.", sense="adjective — tiny"),
])

# ────────────────────────────────────────────── 6. noun / verb stress pairs
deck("skills39-noun-verb-stress", "Noun & verb stress pairs", "Nouns forward, verbs back",
     INSTRUCTIONS, [
 w("Record", "Rec|ord", 0, "/ˈrekɔːd/", "As a noun, stress the first syllable and keep ⟨e⟩ short.", sense="noun"),
 w("Record", "Re|cord", 1, "/rɪˈkɔːd/", "As a verb, the stress moves right and the first vowel reduces.", sense="verb"),
 w("Present", "Pres|ent", 0, "/ˈprezənt/", "As a noun, stress the first syllable; the second reduces to a schwa.", sense="noun"),
 w("Present", "Pre|sent", 1, "/prɪˈzent/", "As a verb, stress the second syllable and give it a full /e/.", sense="verb"),
 w("Object", "Ob|ject", 0, "/ˈɒbdʒɪkt/", "As a noun, stress the first syllable; the second weakens to /-dʒɪkt/.", sense="noun"),
 w("Object", "Ob|ject", 1, "/əbˈdʒekt/", "As a verb, stress the second syllable and the first becomes a schwa.", sense="verb"),
 w("Increase", "In|crease", 0, "/ˈɪŋkriːs/", "As a noun, stress the first syllable.", sense="noun"),
 w("Increase", "In|crease", 1, "/ɪnˈkriːs/", "As a verb, stress the second syllable.", sense="verb"),
 w("Decrease", "De|crease", 0, "/ˈdiːkriːs/", "As a noun, stress the first syllable and keep it long, /ˈdiː-/.", sense="noun"),
 w("Decrease", "De|crease", 1, "/dɪˈkriːs/", "As a verb, stress the second syllable and reduce the first.", sense="verb"),
 w("Survey", "Sur|vey", 0, "/ˈsɜːveɪ/", "As a noun, stress the first syllable.", sense="noun"),
 w("Survey", "Sur|vey", 1, "/səˈveɪ/", "As a verb, stress the second syllable and the first becomes a schwa.", sense="verb"),
 w("Contrast", "Con|trast", 0, "/ˈkɒntrɑːst/", "As a noun, stress the first syllable.", sense="noun"),
 w("Contrast", "Con|trast", 1, "/kənˈtrɑːst/", "As a verb, stress the second syllable and reduce the first.", sense="verb"),
 w("Desert", "Des|ert", 0, "/ˈdezət/", "The noun stresses the first syllable, with a voiced /z/.", sense="noun — dry land"),
 w("Desert", "De|sert", 1, "/dɪˈzɜːt/", "The verb stresses the second syllable, on the long /ɜː/.", sense="verb — to abandon"),
])

# ──────────────────────────────────────────────────────── 7. academic words
deck("skills39-academic-terms", "Academic words", "Exam-text regulars",
     INSTRUCTIONS, [
 w("Huddle", "Hud|dle", 0, "/ˈhʌdəl/", "Short /ʌ/; the doubled ⟨d⟩ does not lengthen it.",
   sense="to gather closely together for warmth"),
 w("Wading", "Wad|ing", 0, "/ˈweɪdɪŋ/", "⟨a⟩ is the diphthong /eɪ/ — it rhymes with fading, not padding.",
   sense="walking through shallow water"),
 w("Vividly", "Viv|id|ly", 0, "/ˈvɪvɪdli/", "Stress the first syllable; both ⟨i⟩ letters are short /ɪ/.",
   sense="in a bright, clear way"),
 w("Virtually", "Vir|tu|al|ly", 0, "/ˈvɜːtʃuəli/", "⟨tu⟩ fuses into /tʃu/: /ˈvɜː-tʃu-ə-li/.",
   sense="almost, for all practical purposes"),
 w("Depression", "De|pres|sion", 1, "/dɪˈpreʃən/", "Stress the middle syllable; ⟨ssi⟩ gives /ʃ/.",
   sense="a hollow in the ground, as well as low mood"),
 w("Unwelcoming", "Un|wel|com|ing", 1, "/ʌnˈwelkəmɪŋ/", "The prefix stays unstressed; stress the second syllable.",
   sense="harsh, inhospitable"),
 w("Overlapping", "O|ver|lap|ping", 2, "/ˌəʊvəˈlæpɪŋ/", "Main stress on ⟨-lap-⟩, secondary on ⟨O-⟩.",
   sense="partly covering one another"),
 w("Agricultural", "Ag|ri|cul|tur|al", 2, "/ˌæɡrɪˈkʌltʃərəl/", "Main stress on ⟨-cul-⟩, and ⟨tu⟩ becomes /tʃə/.",
   sense="to do with farming"),
 w("Appreciation", "Ap|pre|ci|a|tion", 3, "/əˌpriːʃiˈeɪʃən/", "Five syllables: ⟨ci⟩ is /ʃi/ and the main stress is on ⟨-a-⟩.",
   sense="recognition of value"),
])

# ────────────────────────────────────────────── 8. compound & phrasal stress
deck("skills39-compound-stress", "Compound stress", "Which half carries it",
     INSTRUCTIONS, [
 w("Bonfire", "Bon|fire", 0, "/ˈbɒnfaɪə/", "Stress the first half, and ⟨o⟩ stays short /ɒ/."),
 w("Landfills", "Land|fills", 0, "/ˈlændfɪlz/", "Stress the first half, and run /-ndf-/ across the join with no vowel."),
 w("Shortages", "Short|ag|es", 0, "/ˈʃɔːtɪdʒɪz/", "Stress the first syllable; ⟨-ages⟩ reduces to /-ɪdʒɪz/."),
 w("Upcycling", "Up|cyc|ling", 0, "/ˈʌpsaɪklɪŋ/", "Stress the first half, like recycling's opposite; ⟨y⟩ is /aɪ/."),
 w("Wavelengths", "Wave|lengths", 0, "/ˈweɪvleŋθs/", "Stress the first half; the ending stacks up as /-ŋθs/."),
 w("Well-being", "Well|be|ing", 0, "/ˈwelbiːɪŋ/", "Stress the first half; a late-stressed /ˌwelˈbiːɪŋ/ is also heard."),
 w("Mankind", "Man|kind", 1, "/mænˈkaɪnd/", "Unusually for a compound, the stress lands on the second half."),
])

# ──────────────────────────────────────────── 9. orthographic & phonetic traps
deck("skills39-phonetic-traps", "Orthographic & phonetic traps", "Spelling that misleads",
     INSTRUCTIONS, [
 w("Weigh", "Weigh", 0, "/weɪ/", "⟨-eigh⟩ is just /eɪ/ — the ⟨gh⟩ is silent."),
 w("Sphere", "Sphere", 0, "/sfɪər/", "⟨sph-⟩ is /sf-/, a rare opening in English."),
 w("Wounds", "Wounds", 0, "/wuːndz/", "⟨ou⟩ is the long /uː/ — not the /aʊ/ of wound a rope."),
 w("Beneath", "Be|neath", 1, "/bɪˈniːθ/", "Weak first syllable, stress on /-niːθ/, ending voiceless."),
 w("Cupboards", "Cup|boards", 0, "/ˈkʌbərdz/", "The ⟨p⟩ is silent and ⟨-boards⟩ reduces to /-bərdz/."),
 w("Knowledge", "Knowl|edge", 0, "/ˈnɒlɪdʒ/", "Silent ⟨k⟩ and silent ⟨w⟩, and ⟨ow⟩ shortens to /ɒ/."),
 w("Savanna", "Sa|van|na", 1, "/səˈvænə/", "Stress the middle syllable; the outer vowels are schwas."),
 w("Pyjamas", "Py|ja|mas", 1, "/pəˈdʒɑːməz/", "Stress the middle syllable; ⟨y⟩ is only a schwa."),
 w("Mechanisms", "Mech|a|nisms", 0, "/ˈmekənɪzəmz/", "⟨ch⟩ is /k/, and the ending is /-ɪzəmz/."),
 w("Extinction", "Ex|tinc|tion", 1, "/ɪkˈstɪŋkʃən/", "Stress the middle syllable; /-ŋkʃ-/ runs together fast."),
])

# ───────────────────────────────────────────────────────────────── emit
def norm(s):
    return s.replace("-", "").replace(" ", "").lower()

problems = []
tasks = []
for did, nav, title, instructions, words in DECKS:
    out_words = []
    spellings = collections.Counter(norm(text) for text, *_ in words)
    for i, (text, split, stress, ipa, note, extras) in enumerate(words):
        syl = split.split("|")
        if norm("".join(syl)) != norm(text):
            problems.append(f"{did} {text}: syllables {syl!r} do not join to the word")
        if not (0 <= stress < len(syl)):
            problems.append(f"{did} {text}: stress index {stress} out of range for {syl!r}")
        if len(syl) > 1 and "ˈ" not in ipa:
            problems.append(f"{did} {text}: polysyllabic but no primary-stress mark in {ipa}")
        # With no context sentence, `sense` is the only thing telling two
        # identically spelled cards apart -- "Live" and "Live" with nothing
        # under either is unreadable before marking.
        if spellings[norm(text)] > 1 and "sense" not in extras:
            problems.append(f"{did} {text}: repeated spelling with no sense tag")
        word = {"id": f"w{i + 1}", "text": text, "syllables": syl, "stress": stress,
                "ipa": ipa, "note": note}
        if "sense" in extras:
            word["sense"] = extras["sense"]
        out_words.append(word)
    tasks.append({"id": did, "nav": nav, "title": title, "type": "pronounce",
                  "examNum": 39, "drill": "Tricky words",
                  "instructions": instructions, "words": out_words})

# A heteronym pair shares its spelling on purpose, so a duplicate is only a
# duplicate when the transcription matches too.
seen = collections.defaultdict(list)
for t in tasks:
    for word in t["words"]:
        seen[(norm(word["text"]), word["ipa"])].append(f"{t['id']}/{word['id']}")
for key, hits in seen.items():
    if len(hits) > 1:
        problems.append(f"duplicate {key[0]} {key[1]}: {', '.join(hits)}")

if problems:
    raise SystemExit("REJECTED:\n  " + "\n  ".join(problems))

# Mixed practice: a 10th, wordless entry. It rides the same generic per-task
# rendering as the other nine (nav.js builds a sidebar button and a panel for
# every task in the topic), but at open time it pools 10 random words from
# the other nine decks instead of reading its own `words` -- see
# E.seedPronounceQueue in pronounce-deck.js. No content lives here, so it
# needs no entry in the word/deck table above.
tasks.append({"id": "skills39-mixed", "nav": "Mixed practice",
              "title": "Mixed practice", "type": "pronounce", "examNum": 39,
              # A different `drill` value than the nine named decks (all
              # "Tricky words") is what makes nav.js's sidebar break it into
              # its own heading/group instead of numbering it "10)" in
              # sequence with them -- see E.navItemLabel / nav.js's
              # skillKindHeadings branch.
              "drill": "Mixed practice", "mixed": True,
              "instructions": "10 random words pulled from every deck above. Shuffle for a fresh 10.",
              "words": []})

doc = {"id": "reading-skills", "title": "Reading skills",
       "subtitle": "Задание 39 — чтение вслух.", "tasks": tasks}
path = TOPIC_FILES["reading-skills"]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
print(f"wrote {len(tasks)} decks, {sum(len(t['words']) for t in tasks)} words")
for t in tasks:
    print(f"  {len(t['words']):3d}  {t['nav']}")
