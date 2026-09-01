# 美术后处理管线：assets_raw → fuckathon/public/assets
# 步骤：裁水印 → alpha 清理 → 连通域切帧 → 量化(16色) → NEAREST 缩放 → 打包输出 + 核对图
# 用法：python scripts/asset_pipeline/build_assets.py
from PIL import Image
import os, json, math
from collections import deque

ROOT = os.path.dirname(os.path.abspath(__file__))          # fuckathon/scripts/asset_pipeline
PROJ = os.path.dirname(os.path.dirname(ROOT))              # fuckathon/
RAW = os.path.dirname(PROJ)                                # 预制黑客松模拟器/
ASSETS_RAW = os.path.join(RAW, 'material', 'raw')
OUT = os.path.join(PROJ, 'public', 'assets')
REVIEW = os.path.join(RAW, 'material', 'review')
os.makedirs(OUT, exist_ok=True)
os.makedirs(REVIEW, exist_ok=True)

# ---------- 基础工具 ----------

def erase_watermark(im: Image.Image) -> Image.Image:
    """左下角 AI生成 水印区域透明化"""
    w, h = im.size
    px = im.load()
    for y in range(int(h * 0.94), h):
        for x in range(0, int(w * 0.30)):
            px[x, y] = (0, 0, 0, 0)
    return im

def clean_alpha(im: Image.Image, thr=40) -> Image.Image:
    """alpha 二值化，去噪边"""
    a = im.getchannel('A')
    a = a.point(lambda v: 255 if v >= thr else 0)
    im.putalpha(a)
    return im

def components(im: Image.Image, ds=2, min_area=300, merge_margin=24):
    """半分辨率连通域 → 合并近邻框 → 返回全分辨率 bbox 列表 [(x0,y0,x1,y1)]"""
    w, h = im.size
    mask = im.getchannel('A').resize((w // ds, h // ds), Image.NEAREST)
    mw, mh = mask.size
    mp = mask.load()
    lab = [[-1] * mw for _ in range(mh)]
    boxes = []
    for y in range(mh):
        for x in range(mw):
            if mp[x, y] > 0 and lab[y][x] == -1:
                q = deque([(x, y)]); lab[y][x] = len(boxes)
                x0, y0, x1, y1, area = x, y, x, y, 0
                while q:
                    cx, cy = q.popleft(); area += 1
                    x0, y0 = min(x0, cx), min(y0, cy)
                    x1, y1 = max(x1, cx), max(y1, cy)
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < mw and 0 <= ny < mh and mp[nx, ny] > 0 and lab[ny][nx] == -1:
                            lab[ny][nx] = len(boxes); q.append((nx, ny))
                boxes.append([x0, y0, x1, y1, area])
    boxes = [b for b in boxes if b[4] >= min_area // (ds * ds)]
    # 迭代合并近邻框（Z 气泡、断开的四肢）
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                overlap = not (a[2] + merge_margin < b[0] or b[2] + merge_margin < a[0]
                               or a[3] + merge_margin < b[1] or b[3] + merge_margin < a[1])
                if overlap:
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]), a[4] + b[4]]
                    boxes.pop(j); merged = True; break
            if merged: break
    return [[b[0] * ds, b[1] * ds, (b[2] + 1) * ds, (b[3] + 1) * ds] for b in boxes]

def sort_reading_order(boxes, row_tol=140):
    """按阅读顺序排序：先行后列"""
    boxes = sorted(boxes, key=lambda b: ((b[1] + b[3]) / 2, (b[0] + b[2]) / 2))
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        for row in rows:
            if abs(row[0] - cy) < row_tol:
                row[1].append(b); break
        else:
            rows.append([cy, [b]])
    out = []
    for _, row in sorted(rows, key=lambda r: r[0]):
        out.extend(sorted(row, key=lambda b: (b[0] + b[2]) / 2))
    return out

def quantize_rgba(im: Image.Image, colors=16) -> Image.Image:
    a = im.getchannel('A')
    rgb = im.convert('RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    out = rgb.convert('RGBA'); out.putalpha(a)
    return out

def crop_pad(im, box, pad=8):
    w, h = im.size
    return im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad)))

def fit_cell(im: Image.Image, cw: int, ch: int) -> Image.Image:
    """等比 NEAREST 缩放放入 cell，底部对齐（人物贴地）"""
    w, h = im.size
    s = min(cw / w, ch / h)
    nw, nh = max(1, int(w * s)), max(1, int(h * s))
    im = im.resize((nw, nh), Image.NEAREST)
    cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
    cell.paste(im, ((cw - nw) // 2, ch - nh), im)
    return cell

def pack(frames, cw, ch, cols=None):
    cols = cols or len(frames)
    rows = math.ceil(len(frames) / cols)
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * cw, (i // cols) * ch), f)
    return sheet

# ---------- 角色图集 ----------

def process_character(src, name, cell=(64, 64), colors=16, min_area=300, row_tol=140, merge_margin=10):
    im = Image.open(src).convert('RGBA')
    im = erase_watermark(im)
    im = clean_alpha(im)
    boxes = sort_reading_order(components(im, min_area=min_area, merge_margin=merge_margin), row_tol=row_tol)
    frames = [fit_cell(quantize_rgba(crop_pad(im, b), colors), *cell) for b in boxes]
    sheet = pack(frames, *cell)
    sheet.save(os.path.join(OUT, 'sprites', f'{name}.png'), optimize=True)
    # 核对图：带序号的原尺寸裁切
    review = Image.new('RGBA', (len(boxes) * 160, 200), (30, 30, 40, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(review)
    for i, b in enumerate(boxes):
        c = crop_pad(im, b)
        c.thumbnail((150, 170), Image.NEAREST)
        review.paste(c, (i * 160 + 5, 5), c)
        d.text((i * 160 + 5, 180), f'#{i}', fill=(255, 255, 0, 255))
    review.save(os.path.join(REVIEW, f'contact_{name}.png'))
    print(f'{name}: {len(boxes)} 帧')
    return len(boxes)

# ---------- 固定网格/物件图集 ----------

def process_objects(src, name, cell, cols, colors=16, min_area=400, row_tol=120, merge_margin=2):
    im = Image.open(src).convert('RGBA')
    im = erase_watermark(im)
    im = clean_alpha(im)
    boxes = sort_reading_order(components(im, min_area=min_area, merge_margin=merge_margin), row_tol=row_tol)
    tiles = [fit_cell(quantize_rgba(crop_pad(im, b, 4), colors), *cell) for b in boxes]
    sheet = pack(tiles, *cell, cols=cols)
    sheet.save(os.path.join(OUT, f'{name}.png'), optimize=True)
    print(f'{name}: {len(tiles)} 个')
    return len(tiles)

# ---------- 位图（结局插画/UI） ----------

def process_bitmap(src, dst, size, colors=48):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    # 水印区用上方条带的中位色填充
    band = im.crop((0, int(h * 0.90), int(w * 0.30), int(h * 0.94)))
    px = band.resize((1, 1), Image.BILINEAR).getpixel((0, 0))
    d = im.load()
    for y in range(int(h * 0.94), h):
        for x in range(0, int(w * 0.30)):
            d[x, y] = px
    im = im.resize(size, Image.BICUBIC)
    im = im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    im.save(dst, optimize=True)
    print(f'{os.path.basename(dst)}: {os.path.getsize(dst) // 1024}KB')

# ---------- 主流程 ----------

if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'sprites'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'endings'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'ui'), exist_ok=True)
    manifest = {'sprites': {}, 'tiles': 0, 'icons': 0, 'banners': 0, 'endings': 13}

    sp = os.path.join(ASSETS_RAW, 'sprites')
    for f in sorted(os.listdir(sp)):
        name = f[:-4]
        n = process_character(os.path.join(sp, f), name)
        manifest['sprites'][name] = n

    manifest['tiles'] = process_objects(os.path.join(ASSETS_RAW, 'tiles', 'tileset.png'), 'tiles', (48, 48), cols=8)

    ic1 = process_objects(os.path.join(ASSETS_RAW, 'icons', 'icons_1.png'), 'icons_1', (24, 24), cols=8, min_area=200)
    ic2 = process_objects(os.path.join(ASSETS_RAW, 'icons', 'icons_2.png'), 'icons_2', (24, 24), cols=8, min_area=200)
    manifest['icons'] = ic1 + ic2

    b1 = process_objects(os.path.join(ASSETS_RAW, 'banners', 'banners_1.png'), 'banners_1', (96, 24), cols=1, min_area=2000, row_tol=60, merge_margin=0)
    b2 = process_objects(os.path.join(ASSETS_RAW, 'banners', 'banners_2.png'), 'banners_2', (96, 24), cols=1, min_area=2000, row_tol=60, merge_margin=0)
    manifest['banners'] = b1 + b2

    en = os.path.join(ASSETS_RAW, 'endings')
    for f in sorted(os.listdir(en)):
        process_bitmap(os.path.join(en, f), os.path.join(OUT, 'endings', f), (640, 427), colors=48)

    ui = os.path.join(ASSETS_RAW, 'ui')
    logo = Image.open(os.path.join(ui, 'logo.png')).convert('RGBA')
    logo = clean_alpha(erase_watermark(logo))
    # 裁掉透明边
    bbox = logo.getchannel('A').getbbox()
    if bbox: logo = logo.crop(bbox)
    logo = quantize_rgba(logo, 16)
    logo.thumbnail((256, 256), Image.NEAREST)
    logo.save(os.path.join(OUT, 'ui', 'logo.png'), optimize=True)
    print(f'logo: {os.path.getsize(os.path.join(OUT, "ui", "logo.png")) // 1024}KB')

    process_bitmap(os.path.join(ui, 'title_bg.png'), os.path.join(OUT, 'ui', 'title_bg.png'), (1024, 576), colors=32)
    for f in ['loading_1.png', 'loading_2.png']:
        process_bitmap(os.path.join(ui, f), os.path.join(OUT, 'ui', f), (768, 512), colors=32)
    # 场地背景插画（比赛场景铺底）
    for f in ['bg_school.png', 'bg_cowork.png', 'bg_park.png']:
        process_bitmap(os.path.join(ui, f), os.path.join(OUT, 'ui', f), (768, 480), colors=32)

    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=2)
    print('\nmanifest.json 已写入')
