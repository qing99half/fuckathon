// 资源索引与语义映射（由后处理管线核对图定稿）

export const A = (p: string) => `assets/${p}`;

// 角色帧语义：code 敲代码 / sleep 趴桌 / walk 走 / stand 站（仅 NPC 单体图集使用）
export const SPRITES: Record<string, { frames: number; code: number[]; sleep: number[]; walk: number[]; stand: number[] }> = {
  npc_leader:       { frames: 2, code: [1], sleep: [0], walk: [0], stand: [0] },   // 0 站立 1 讲话
  npc_photographer: { frames: 2, code: [0], sleep: [0], walk: [0], stand: [0] },   // 1 = 闪光灯
  npc_sponsor:      { frames: 2, code: [1], sleep: [0], walk: [0], stand: [0] },
  npc_delivery:     { frames: 2, code: [0], sleep: [0], walk: [1], stand: [0] },
  npc_volunteer:    { frames: 4, code: [0], sleep: [0], walk: [2, 3], stand: [0] }, // 0正 1背 2-3搬箱
};
export const SPRITE_CELL = 64;

// 一体式工位图集：station_0..7，每张 5 帧固定顺序
export const STATION_COUNT = 8;
export const STATION_CELL = 96;
export const STATION_FRAME = { code: 0, sleep: 1, stand: 2, phone: 3, empty: 4 } as const;

// tiles.png：8 列 × 48px
export const TILE = {
  floorWood: 0, table: 1, carpetRed: 2, podiumTable: 3, floorGray: 4, floorDark: 5,
  wallWood: 6, window: 7, door: 8, sleepingBags: 9, chairBack: 10, deskChair: 11,
  officeChair: 12, boothWhite: 13, bench: 14, chair: 15, chairDouble: 16, vending: 17,
  foodStand: 18, foodStand3: 19, sleepingBags2: 20, stageRed: 21, podium: 22,
  checkinDesk: 23, boothDesk: 24, sponsorSign: 25, plant: 26, trash: 27, laptop: 28,
  mealBox: 29, powerStrip: 30, box: 31, backpack: 32, stageLight: 33, floorLamp: 34,
  divider: 35, sofa: 36, water: 37, chairStack: 38, whiteboard: 39, coffee: 40,
  frontDesk: 41, camera: 42, trophyTable: 43, ropeLine: 44,
};
export const TILE_COLS = 8;
export const TILE_CELL = 48;

// icons_1.png：8 列 × 24px（13 有效）
export const ICON = {
  money: 0, buzz: 1, gov: 2, rep: 3, chaos: 4, target: 5,
  thermoGreen: 6, thermoRed: 7, thermoYellow: 8, thermoRed2: 9, lock: 10, arrows: 11,
};
export const ICON_COLS = 8;
export const ICON_CELL = 24;

// 赞助商横幅：程序化绘制（红绸+金字），不再使用图集

// 结局 id → 插画文件
export const ENDING_IMG: Record<string, string> = {
  prefab: 'ending_01_prefab_master.png', smooth: 'ending_02_smooth.png',
  exposed: 'ending_03_exposed.png', nobody: 'ending_04_nobody.png',
  sincere: 'ending_05_sincere.png', spring: 'ending_06_spring.png',
  token: 'ending_07_token.png', nephew: 'ending_08_nephew.png',
  balance: 'ending_09_balance.png', leaderhappy: 'ending_10_leader.png',
  grifter: 'ending_11_grifter.png', withdrawal: 'ending_12_withdrawal.png',
  annual: 'ending_13_annual.png',
  die_sunge: 'ending_14_sunge.png', die_cognition: 'ending_15_cognition.png',
  die_runaway: 'ending_16_runaway.png', die_meal: 'ending_17_meal.png',
  die_power: 'ending_18_power.png', die_leader: 'ending_19_leader.png',
  die_fight: 'ending_20_fight.png', die_screen: 'ending_21_screen.png',
  die_ban: 'ending_22_ban.png',
};

// 图片加载器（带缓存）
const cache = new Map<string, HTMLImageElement>();
export function loadImg(path: string): Promise<HTMLImageElement> {
  const hit = cache.get(path);
  if (hit) return Promise.resolve(hit);
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => { cache.set(path, im); res(im); };
    im.onerror = rej;
    im.src = path;
  });
}
export function getImg(path: string): HTMLImageElement | null { return cache.get(path) ?? null; }
