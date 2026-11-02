"""Build a synthetic gsm.db for the demo. Titles and text are made up.

Usage: python3 test/make-demo-db.py OUT.db
"""

import json
import random
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta

random.seed(2025)
YEAR = 2025

GAMES = [
    ("星降る夜のメモリア", "Memoria of a Starfall Night", "Visual Novel", ["Romance", "Drama", "Fantasy"], 1, 0.30),
    ("放課後ラプソディ", "After-School Rhapsody", "Visual Novel", ["Slice of Life", "Comedy", "Music"], 1, 0.22),
    ("迷宮探偵アリス", "Labyrinth Detective Alice", "Game", ["Mystery", "Adventure"], 0, 0.16),
    ("海辺のカフェ日記", "Seaside Café Diary", "Visual Novel", ["Slice of Life", "Romance"], 1, 0.12),
    ("月影の剣士", "Swordsman of the Moonlight", "Manga", ["Action", "Fantasy"], 0, 0.09),
    ("ことのは学園", "Kotonoha Academy", "Visual Novel", ["Comedy", "School"], 0, 0.07),
    ("夢見る機械", "The Dreaming Machine", "Game", ["Sci-Fi", "Mystery"], 0, 0.04),
]

SENTENCES = [
    "「ユキ、今日の放課後って空いてる？」",
    "夜空に流れ星がひとつ、静かに消えていった。",
    "「それって、つまり……私のこと、心配してくれてたの？」",
    "扉の向こうから、かすかにピアノの音が聞こえる。",
    "「ハルト君、また遅刻だよ。先生に怒られちゃうよ？」",
    "この町の海は、季節によって色が変わるらしい。",
    "「犯人はこの中にいる。そう考えるのが自然だろう」",
    "温かいコーヒーの香りが店内に広がっていた。",
    "「約束したでしょ。いつか一緒に星を見に行こうって」",
    "迷宮の奥へ進むほど、空気は冷たくなっていく。",
    "「ねえ、もう少しだけここにいてもいい？」",
    "月明かりの下、剣士は静かに刀を抜いた。",
    "窓の外では、桜の花びらが風に舞っている。",
    "「私たちのバンド、今度の文化祭で演奏するんだって！」",
    "古い時計塔の鐘が、町に正午を告げた。",
    "「その記憶、本当にあなたのものなの？」",
    "機械の少女は、初めて夢というものを見た。",
    "「大丈夫。ユキならきっとできるよ」",
    "雨上がりの坂道を、二人はゆっくりと歩いた。",
    "「この手紙を、彼女に届けてほしいんだ」",
    "図書室の奥には、誰も知らない秘密の扉がある。",
    "「探偵さん、証拠はちゃんと揃っているんですか？」",
    "夏祭りの夜、花火が空いっぱいに咲いた。",
    "「先輩、今日のケーキは自信作なんです！」",
    "静かな教室に、チョークの音だけが響いていた。",
    "「世界がどうなっても、私はあなたの味方だから」",
    "星の欠片を集めると、願いがひとつ叶うという。",
    "「ハルト、ギターの弦、また切れてるよ」",
    "潮風が頬をなでて、遠い記憶を呼び起こす。",
    "「真実はいつも、思っているより近くにある」",
]

WORDS = [
    ("ユキ", "名詞"), ("ハルト", "名詞"), ("星", "名詞"), ("記憶", "名詞"), ("約束", "名詞"),
    ("先輩", "名詞"), ("探偵", "名詞"), ("迷宮", "名詞"), ("バンド", "名詞"), ("夢", "名詞"),
    ("海", "名詞"), ("手紙", "名詞"), ("秘密", "名詞"), ("真実", "名詞"), ("剣士", "名詞"),
    ("聞こえる", "動詞"), ("届ける", "動詞"), ("集める", "動詞"), ("叶う", "動詞"), ("演奏", "名詞"),
    ("静か", "形状詞"), ("温かい", "形容詞"), ("冷たい", "形容詞"), ("ゆっくり", "副詞"),
    ("放課後", "名詞"), ("文化祭", "名詞"), ("流れ星", "名詞"), ("証拠", "名詞"), ("犯人", "名詞"),
    ("する", "動詞"), ("いる", "動詞"), ("こと", "名詞"), ("の", "助詞"), ("は", "助詞"),
]


def main(out):
    c = sqlite3.connect(out)
    c.executescript(
        """
        CREATE TABLE games (id TEXT PRIMARY KEY, deck_id TEXT, title_original TEXT, title_romaji TEXT, title_english TEXT,
            type TEXT, description TEXT, image TEXT, character_count TEXT, difficulty TEXT, links TEXT, completed TEXT,
            release_date TEXT, manual_overrides TEXT, obs_scene_name TEXT, genres TEXT, tags TEXT, vndb_character_data TEXT,
            character_summary TEXT, vndb_id TEXT, anilist_id TEXT, status TEXT);
        CREATE TABLE game_lines (id TEXT PRIMARY KEY, game_name TEXT, line_text TEXT, screenshot_in_anki TEXT,
            audio_in_anki TEXT, screenshot_path TEXT, audio_path TEXT, replay_path TEXT, translation TEXT, timestamp REAL,
            original_game_name TEXT, game_id TEXT, note_ids TEXT, last_modified TEXT, language TEXT);
        CREATE INDEX idx_game_lines_timestamp ON game_lines(timestamp);
        CREATE TABLE daily_stats_rollup (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, word_frequency_data TEXT);
        CREATE TABLE words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT, reading TEXT, pos TEXT, in_anki TEXT,
            last_seen TEXT, first_seen TEXT, first_seen_line_id TEXT);
        CREATE TABLE anki_reviews (review_id TEXT PRIMARY KEY, card_id TEXT, note_id TEXT, review_time TEXT, ease TEXT,
            interval TEXT, last_interval TEXT, time_taken TEXT, synced_at TEXT);
        """
    )
    ids = []
    for title, en, typ, genres, done, _ in GAMES:
        gid = str(uuid.uuid4())
        ids.append(gid)
        c.execute(
            "INSERT INTO games (id, title_original, title_english, type, genres, completed, status) VALUES (?,?,?,?,?,?,?)",
            (gid, title, en, typ, json.dumps(genres), str(done), "completed" if done else "playing"),
        )
    weights = [g[5] for g in GAMES]

    # One title at a time, roughly in sequence through the year.
    order = sorted(range(len(GAMES)), key=lambda i: random.random() + (0 if GAMES[i][4] else 0.4))
    day = datetime(YEAR, 1, 1)
    n = 0
    word_rows = {}
    while day.year == YEAR:
        progress = (day - datetime(YEAR, 1, 1)).days / 365
        p_read = 0.55 + 0.35 * progress + (0.1 if day.weekday() >= 5 else 0)
        if random.random() < p_read:
            gi = order[min(len(order) - 1, int(progress * len(order) * 1.15))]
            if random.random() < 0.25:
                gi = random.choices(range(len(GAMES)), weights)[0]
            hour = random.choices([7, 12, 19, 20, 21, 22, 23, 0, 1], [1, 1, 3, 4, 6, 7, 6, 3, 1])[0]
            start = day + timedelta(hours=hour if hour else 24, minutes=random.randint(0, 50))
            minutes = random.randint(25, 80 + int(progress * 60)) * (1.5 if day.weekday() >= 5 else 1)
            t = start
            cps = 1.3 + 1.2 * progress  # reads faster as the year goes on
            freq = {}
            while t < start + timedelta(minutes=minutes):
                text = random.choice(SENTENCES)
                n += 1
                mined = random.random() < 0.022
                c.execute(
                    "INSERT INTO game_lines (id, game_name, line_text, timestamp, game_id, note_ids, screenshot_in_anki, audio_in_anki, language) VALUES (?,?,?,?,?,?,?,?,?)",
                    (f"l{n}", GAMES[gi][0], text, t.timestamp(), ids[gi], json.dumps([str(10**12 + n)]) if mined else "[]", "", "", "ja"),
                )
                for w, pos in WORDS:
                    if w in text or pos == "助詞":
                        freq[w] = freq.get(w, 0) + 1
                        word_rows.setdefault(w, (pos, t.timestamp()))
                t += timedelta(seconds=max(2.0, random.gauss(len(text) / cps, 2.5)))
            c.execute("INSERT INTO daily_stats_rollup (date, word_frequency_data) VALUES (?,?)", (day.strftime("%Y-%m-%d"), json.dumps(freq, ensure_ascii=False)))
        day += timedelta(days=1)
    for w, (pos, first) in word_rows.items():
        c.execute("INSERT INTO words (word, pos, first_seen) VALUES (?,?,?)", (w, pos, str(first)))
    base = datetime(YEAR, 1, 1).timestamp() * 1000
    for i in range(18000):
        rt = int(base + random.random() * 365 * 86400 * 1000)
        c.execute("INSERT INTO anki_reviews (review_id, review_time, time_taken) VALUES (?,?,?)", (f"r{i}", str(rt), str(random.randint(3000, 14000))))
    c.commit()
    print("lines", n)


if __name__ == "__main__":
    main(sys.argv[1])
