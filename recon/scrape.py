import re, sys, time, urllib.request, os
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
def get(url):
    req=urllib.request.Request(url, headers={"User-Agent":UA})
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8","replace")

LIST="https://appmedia.jp/pokemonchampions/79917367"
html=get(LIST)
# id -> name（<a href=".../pokemonchampions/ID"> ... alt="NAME" もしくは >NAME< を近傍から）
idname={}
for m in re.finditer(r'pokemonchampions/(\d+)"[^>]*>(.*?)</a>', html, re.S):
    pid=m.group(1); inner=m.group(2)
    alt=re.search(r'alt="([^"]+)"', inner)
    txt=re.sub(r'<[^>]+>','',inner).strip()
    name=(alt.group(1) if alt else txt).strip()
    if 1<=len(name)<=14 and pid not in idname and name:
        idname[pid]=name

TARGETS=["フォレトス","ハガネール","ハッサム","エアームド","クチート","ボスゴドラ","チリーン",
 "メタグロス","エンペルト","トリデプス","ルカリオ","ドリュウズ","ガラルマッギョ","ギルガルド",
 "ヒスイヌメルゴン","クレッフィ","アーマーガア","デカヌチャン","ミミズズ","ドドゲザン","サーフゴー","ブリジュラス"]
name2id={}
for pid,nm in idname.items():
    for t in TARGETS:
        if nm==t or nm.startswith(t): name2id.setdefault(t,pid)

os.makedirs("recon/pages", exist_ok=True)
# 生HTMLの構造ダンプ（各ターゲット名の最初の出現周辺）
with open("recon/ctx.txt","w") as cf:
    cf.write(f"list html size={len(html)}\n")
    for t in ["ボスゴドラ","メタグロス","サーフゴー"]:
        i=html.find(t)
        cf.write(f"\n===== {t} idx={i} =====\n")
        if i>=0: cf.write(re.sub(r'\s+',' ', html[max(0,i-400):i+120]))
with open("recon/map.txt","w") as f:
    f.write("=== 全id→名前ペア（%d件） ===\n"%len(idname))
    for pid,nm in list(idname.items())[:200]: f.write(f"{pid}\t{nm}\n")
    f.write("\n=== TARGET マッチ ===\n")
    for t in TARGETS: f.write(f"{t}\t{name2id.get(t,'NOT FOUND')}\n")

# ボスゴドラのページ構造をダンプ（覚える技の並び確認用）
bid=name2id.get("ボスゴドラ")
struct=open("recon/struct.txt","w")
if bid:
    time.sleep(1.5)
    page=get(f"https://appmedia.jp/pokemonchampions/{bid}")
    open("recon/pages/boss.html","w").write(page[:400000])
    struct.write(f"ボスゴドラ page id={bid}, size={len(page)}\n")
    # 「覚える」を含む見出し周辺
    for m in re.finditer("覚える", page):
        s=max(0,m.start()-80); struct.write("..."+re.sub(r'\s+',' ',page[s:m.start()+400])+"\n---\n")
    # 技名リンクらしき: waza を含む href とテキスト
    struct.write("\n=== waza/move リンク例 ===\n")
    for m in re.finditer(r'href="([^"]*(?:waza|move)[^"]*)"[^>]*>([^<]{1,12})</a>', page)[:0] if False else []:
        pass
    for m in list(re.finditer(r'>([ぁ-んァ-ヶ一-龠ー]{2,10})</a>', page))[:40]:
        struct.write(m.group(1)+" ")
else:
    struct.write("ボスゴドラのページIDが特定できませんでした\n")
struct.close()
print("done")
