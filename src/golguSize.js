// 골구도 회전 무대와 호실 칸의 크기 계산(화면과 무관한 숫자 계산만 모아 둔 파일).
// 숫자는 "배율 1" 기준이고, 실제 화면에서는 화면 너비에 맞춰 구한 배율(scale)을 곱해 쓴다.
// 배율이 커지면 칸·글자·무대 높이·회전 반지름·원근 거리가 모두 같은 비율로 커진다.
import { unitOptions } from "./data.js";

export const BASE_RADIUS = 190; // 동 카드가 놓이는 원의 반지름
export const PERSPECTIVE = 1500; // 원근 거리
export const FRONT_MAGNIFY = PERSPECTIVE / (PERSPECTIVE - BASE_RADIUS); // 정면 카드가 원근 때문에 실제보다 크게 보이는 정도(약 1.145배). 반지름과 원근 거리를 같은 배율로 키우므로 배율과 무관하다.
export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.5; // 넓은 화면(PC)에서 칸을 이전보다 1.5배로 키운다
export const SCALE_STEP = 0.05; // 배율은 0.05 단위로만 바꿔서, 화면 폭이 조금씩 변해도 무대 높이가 계속 출렁이지 않게 한다
export const SIDE_MARGIN = 16; // 정면 카드 양옆으로 남겨 둘 여백(px)

// 동 하나의 칸 크기(배율 1 기준). 칸이 작아 안 보이던 문제를 줄이려고 세로 최소값을 9 → 12로 올렸다(층이 아주 많은 동도 칸이 너무 납작해지지 않게).
export function baseSizeOf(building) {
  const floors = Math.max(1, Math.floor(Number(building && building.floors)) || 1);
  const units = unitOptions(building && building.unitsPerFloor).length;
  const brickW = Math.max(32, Math.min(46, 190 / units));
  const brickH = Math.max(12, Math.min(24, 300 / floors));
  return { floors, units, brickW, brickH, width: brickW * units, height: brickH * floors };
}

// 무대 너비(px)에 정면 카드(가장 넓은 동 기준, 배율 1일 때의 너비)가 여백을 두고 들어가는 가장 큰 배율. 너비를 아직 모르면 1.
export function fitScale(stageWidth, widestCard) {
  if (!(stageWidth > 0) || !(widestCard > 0)) return 1;
  const raw = (stageWidth - 2 * SIDE_MARGIN) / (widestCard * FRONT_MAGNIFY);
  const stepped = Math.floor(raw / SCALE_STEP + 1e-9) * SCALE_STEP;
  return Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, stepped)) * 100) / 100;
}

// 무대 높이(px): 가장 높은 동(배율 1일 때의 높이)이 위아래로 잘리지 않고, 아래쪽 회전판·동 이름까지 모두 보이는 높이
export function stageHeightFor(tallestCard, scale) {
  return Math.round(1.07 * tallestCard * scale + 96 * scale + 36);
}

// 카드 하나를 실제로 그릴 크기(px). 칸의 글자는 칸 높이에 맞춰 키운다(작은 글자가 안 보인다는 문제 때문에 이전보다 크게: 칸 높이의 0.56배, 9~14px).
export function cardMetrics(building, scale) {
  const b = baseSizeOf(building);
  const brickH = b.brickH * scale;
  const width = Math.round(b.brickW * scale * b.units);
  const height = Math.round(brickH * b.floors);
  const fontSize = Math.round(Math.max(9, Math.min(14, brickH * 0.56)) * 10) / 10;
  return { width, height, brickH, fontSize, units: b.units, floors: b.floors };
}

// 동 목록 전체에서 가장 넓은 카드와 가장 높은 카드(배율 1 기준)
export function extremesOf(buildings) {
  let widest = 1;
  let tallest = 1;
  for (const b of Array.isArray(buildings) ? buildings : []) {
    const s = baseSizeOf(b);
    widest = Math.max(widest, s.width);
    tallest = Math.max(tallest, s.height);
  }
  return { widest, tallest };
}
