"""Build app data: parse word/sentence/IPA sources, attach US IPA from CMUdict, validate, emit data.js."""
import json, re, sys, unicodedata, pathlib
import cmudict

# ===== CONFIG =====
ROOT = pathlib.Path(__file__).parent
DATA = ROOT / "data"
OUT_JS = ROOT / "build" / "data.js"
LEVELS = {"kids": ["kids1.txt", "kids2.txt", "kids3.txt", "kids4.txt", "kids5.txt"],
          "toeic": ["toeic1.txt", "toeic2.txt", "toeic3.txt", "toeic4.txt", "toeic5.txt", "toeic6.txt", "toeic7.txt", "toeic8.txt",
                    "toeic9.txt", "toeic10.txt", "toeic11.txt"]}
SENTENCE_FILES = ["sent_daily.txt", "sent_work.txt", "sent_toeic.txt"]
IPA_FILE = "ipa.json"
GRAMMAR_FILES = ["kids.json", "toeic.json"]  # data/grammar: Ngữ pháp Tiếng Anh 7 (Global Success) và TOEIC
STEM_FILES = ["math7.json", "math8.json", "math9.json", "phys7.json", "phys8.json", "phys9.json"]  # data/stem: Toán & Vật lí lớp 7–9
# Manual IPA for words CMU lacks or gets wrong for our part of speech
OVERRIDES = {
    "wind|n": "wɪnd", "close|v": "kloʊz", "live|v": "lɪv", "use|n": "juːs", "use|v": "juːz",
    "record|n": "ˈrekɚd", "record|v": "rɪˈkɔːrd", "present|n": "ˈprezənt", "present|v": "prɪˈzent",
    "produce|v": "prəˈduːs", "produce|n": "ˈproʊduːs", "increase|n": "ˈɪnkriːs", "increase|v": "ɪnˈkriːs",
    "decrease|n": "ˈdiːkriːs", "decrease|v": "dɪˈkriːs", "contract|n": "ˈkɑːntrækt", "object|n": "ˈɑːbdʒɪkt",
    "permit|n": "ˈpɝːmɪt", "permit|v": "pɚˈmɪt", "conduct|v": "kənˈdʌkt", "refund|n": "ˈriːfʌnd",
    "estimate|n": "ˈestɪmət", "estimate|v": "ˈestɪmeɪt", "lead|v": "liːd", "minute|n": "ˈmɪnɪt",
    "content|n": "ˈkɑːntent", "export|n": "ˈekspɔːrt", "import|n": "ˈɪmpɔːrt", "upgrade|n": "ˈʌpɡreɪd",
    "transfer|n": "ˈtrænsfɝː", "transfer|v": "trænsˈfɝː", "survey|n": "ˈsɝːveɪ", "address|n": "ˈædres",
    "invoice|n": "ˈɪnvɔɪs", "graduate|n": "ˈɡrædʒuət", "duplicate|n": "ˈduːplɪkət", "separate|adj": "ˈsepərət",
    "appropriate|adj": "əˈproʊpriət", "alternate|adj": "ˈɔːltɚnət", "subject|n": "ˈsʌbdʒɪkt",
    "project|n": "ˈprɑːdʒekt", "progress|n": "ˈprɑːɡres", "conflict|n": "ˈkɑːnflɪkt", "discount|n": "ˈdɪskaʊnt",
    "desert|n": "ˈdezɚt", "tear|v": "ter", "row|n": "roʊ", "bow|v": "baʊ", "read|v": "riːd",
    "yoghurt": "ˈjoʊɡɚt", "café": "kæˈfeɪ", "bamboo-copter": "bæmˈbuː ˈkɑːptɚ", "hyperloop": "ˈhaɪpɚluːp",
    "skytrain": "ˈskaɪtreɪn", "suncream": "ˈsʌnkriːm", "eggshell": "ˈeɡʃel", "lorry": "ˈlɔːri",
    "teleporter": "ˈtelɪpɔːrtɚ", "driverless": "ˈdraɪvɚləs", "mooncake": "ˈmuːnkeɪk", "maths": "mæθs",
    "stomachache": "ˈstʌməkeɪk", "programme": "ˈproʊɡræm", "theatre": "ˈθiːətɚ", "centre": "ˈsentɚ",
    "co-worker": "ˈkoʊ ˌwɝːkɚ", "e-commerce": "ˌiː ˈkɑːmɝːs", "itinerary": "aɪˈtɪnəreri", "chapped lips": "tʃæpt lɪps",
    "omelette": "ˈɑːmlət", "schoolbag": "ˈskuːlbæɡ", "shortlist": "ˈʃɔːrtlɪst",
    "elaborate|v": "ɪˈlæbəreɪt", "overlook|v": "ˌoʊvɚˈlʊk", "overhead|adv": "ˌoʊvɚˈhed", "unpack": "ʌnˈpæk", "unveil": "ʌnˈveɪl",
    "unattended": "ˌʌnəˈtendɪd", "foliage": "ˈfoʊliɪdʒ", "sidewalk": "ˈsaɪdwɔːk", "footwear": "ˈfʊtwer", "artwork": "ˈɑːrtwɝːk", "complement|v": "ˈkɑːmpləment", "compliment|n": "ˈkɑːmpləmənt",
    "helpline": "ˈhelplaɪn", "backorder": "ˈbækˌɔːrdɚ", "punctually": "ˈpʌŋktʃuəli", "rsvp": "ˌɑːr es viː ˈpiː",
}
BRIT = [(r"ise$", "ize"), (r"ised$", "ized"), (r"ising$", "izing"), (r"isation$", "ization"), (r"our", "or"),
        (r"tre$", "ter"), (r"ogue$", "og"), (r"ll(ed|ing)$", r"l\1"), (r"yse$", "yze"), (r"ence$", "ense"), (r"mme$", "m")]
# ==================

CMU = cmudict.dict()
VOW = {"AA": "ɑː", "AE": "æ", "AO": "ɔː", "AW": "aʊ", "AY": "aɪ", "EH": "e", "EY": "eɪ", "IH": "ɪ",
       "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ"}
CON = {"B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ", "K": "k",
       "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t",
       "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}
ONSETS = {tuple(o.split()) for o in """P L|B L|K L|G L|F L|S L|P R|B R|T R|D R|K R|G R|F R|TH R|SH R|T W|D W|K W|G W|S W|
S P|S T|S K|S M|S N|S F|S P L|S P R|S T R|S K R|S K W|S K L|P Y|B Y|K Y|G Y|F Y|V Y|HH Y|M Y|S P Y|S K Y|TH W""".replace("\n", "").split("|")}


def vowel_ipa(base, stress):
    if base == "AH":
        return "ʌ" if stress in "12" else "ə"
    if base == "ER":
        return "ɝː" if stress in "12" else "ɚ"
    if base == "IH":
        return "ɪ"
    if base == "IY":
        return "iː" if stress in "12" else "i"
    if base == "UW":
        return "uː" if stress in "12" else "u"
    return VOW[base]


def arpa_to_ipa(phones):
    phones = list(phones)
    vidx = [i for i, p in enumerate(phones) if p[-1].isdigit()]
    # CMU marks reduced prefixes (re-, de-, can-) with secondary stress right before the primary: drop it
    if len(vidx) > 1 and phones[vidx[0]][-1] == "2" and phones[vidx[1]][-1] == "1":
        base = phones[vidx[0]][:-1]
        phones[vidx[0]] = ("IH" if base == "IY" else base) + "0"
    starts = {}
    prev = -1
    for vi in vidx:
        cluster = phones[prev + 1:vi]
        k = 0
        for k in range(len(cluster), -1, -1):  # longest legal onset suffix
            suf = tuple(cluster[len(cluster) - k:])
            if k == 0 or (k == 1 and suf[0] != "NG") or suf in ONSETS:
                break
        starts[vi] = vi - k
        prev = vi
    marks = {}
    if len(vidx) > 1:
        for vi in vidx:
            s = phones[vi][-1]
            if s in "12":
                marks[starts[vi]] = "ˈ" if s == "1" else "ˌ"
    out = []
    for i, p in enumerate(phones):
        out.append(marks.get(i, ""))
        out.append(vowel_ipa(p[:-1], p[-1]) if p[-1].isdigit() else CON[p])
    return "".join(out)


def stress_first(pron):
    v = [p for p in pron if p[-1].isdigit()]
    return bool(v) and v[0][-1] == "1"


def lookup(token, pos):
    t = unicodedata.normalize("NFKD", token.lower()).encode("ascii", "ignore").decode().strip("'.")
    cands = [t]
    for pat, rep in BRIT:
        alt = re.sub(pat, rep, t)
        if alt != t:
            cands.append(alt)
    for c in cands:
        prons = CMU.get(c)
        if prons:
            if len(prons) > 1 and pos in ("n", "v"):
                pref = [p for p in prons if stress_first(p) == (pos == "n")]
                if pref:
                    return arpa_to_ipa(pref[0])
            return arpa_to_ipa(prons[0])
    return None


def word_ipa(word, pos):
    for key in (f"{word.lower()}|{pos}", word.lower()):
        if key in OVERRIDES:
            return OVERRIDES[key]
    parts = []
    for tok in re.split(r"[\s]+", word):
        if tok.lower() in OVERRIDES:
            parts.append(OVERRIDES[tok.lower()]); continue
        sub = [lookup(s, pos) for s in tok.split("-")]
        if any(s is None for s in sub):
            return None
        parts.append(" ".join(sub) if len(sub) > 1 else sub[0])
    return " ".join(parts)


def parse_words(files):
    topics, seen, missing, dups = [], set(), [], []
    for f in files:
        for ln, line in enumerate((DATA / f).read_text(encoding="utf-8").splitlines(), 1):
            line = line.strip()
            if not line:
                continue
            if line.startswith("#"):
                en, vi = [s.strip() for s in line[1:].split("|")]
                topics.append({"en": en, "vi": vi, "words": []}); continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 5 or not all(parts):
                sys.exit(f"{f}:{ln} bad line: {line}")
            w, pos, vi, ex, emo = parts
            key = (w.lower(), pos)
            if key in seen:
                dups.append(f"{f}:{ln} {w}"); continue
            seen.add(key)
            ipa = word_ipa(w, pos)
            if ipa is None:
                missing.append(w); ipa = ""
            topics[-1]["words"].append([w, pos, ipa, vi, ex, emo])
    return topics, missing, dups


def parse_sentences(f):
    groups = []
    for ln, line in enumerate((DATA / f).read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        if line.startswith("#"):
            stage, en, vi = [s.strip() for s in line[1:].split("|")]
            groups.append({"stage": stage, "en": en, "vi": vi, "items": []}); continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) not in (2, 3):
            sys.exit(f"{f}:{ln} bad sentence: {line}")
        groups[-1]["items"].append(parts + [""] * (3 - len(parts)))
    return groups


def main():
    out, report = {"levels": {}, "sentences": {}}, {}
    for lvl, files in LEVELS.items():
        files = [x for x in files if (DATA / x).exists()]
        topics, missing, dups = parse_words(files)
        out["levels"][lvl] = topics
        n = sum(len(t["words"]) for t in topics)
        report[lvl] = n
        print(f"[{lvl}] {n} words, {len(topics)} topics, missing IPA {len(missing)}: {missing[:60]}")
        if dups:
            print(f"  duplicates skipped: {dups}")
    for f in SENTENCE_FILES:
        if (DATA / f).exists():
            g = parse_sentences(f)
            out["sentences"][f.split("_")[1].split(".")[0]] = g
            print(f"[{f}] {sum(len(x['items']) for x in g)} sentences, {len(g)} groups")
    if (DATA / IPA_FILE).exists():
        out["ipa"] = json.loads((DATA / IPA_FILE).read_text(encoding="utf-8"))
        print(f"[ipa] {len(out['ipa']['sounds'])} sounds")
    stem = []
    for f in STEM_FILES:
        lessons = json.loads((DATA / "stem" / f).read_text(encoding="utf-8"))
        for L in lessons:
            if not (L["quiz"] and all(0 <= q["a"] < len(q["opts"]) for q in L["quiz"])):
                sys.exit(f"stem/{f}: bad quiz in {L['id']}")
        stem += lessons
    ids = [L["id"] for L in stem]
    if len(set(ids)) != len(ids):
        sys.exit("stem: duplicate lesson ids")
    out["stem"] = stem
    grammar = []
    for f in GRAMMAR_FILES:
        lessons = json.loads((DATA / "grammar" / f).read_text(encoding="utf-8"))
        for L in lessons:
            if not all(0 <= q["a"] < len(q["opts"]) for q in L["quiz"]):
                sys.exit(f"grammar/{f}: bad quiz in {L['id']}")
        grammar += lessons
    if len({L["id"] for L in grammar}) != len(grammar):
        sys.exit("grammar: duplicate lesson ids")
    out["grammar"] = grammar
    print(f"[grammar] {sum(L['lvl'] == 'kids' for L in grammar)} Tiếng Anh 7 + {sum(L['lvl'] == 'toeic' for L in grammar)} TOEIC lessons")
    print(f"[stem] {sum(L['subj'] == 'math' for L in stem)} math + {sum(L['subj'] == 'phys' for L in stem)} physics lessons")
    OUT_JS.parent.mkdir(exist_ok=True)
    OUT_JS.write_text("window.APP_DATA=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(f"wrote {OUT_JS} ({OUT_JS.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
