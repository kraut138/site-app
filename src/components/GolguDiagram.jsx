import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { Grid3x3, Info } from "lucide-react";
import { CATEGORIES, itemsForCategory, unitOptions } from "../data.js";
import { createStatus, voiceTotals } from "../golguStatus.js";
import { BASE_RADIUS, PERSPECTIVE, cardMetrics, extremesOf, fitScale, stageHeightFor } from "../golguSize.js";
import { Icon } from "./UI.jsx";

const VISIBLE_CATEGORIES = CATEGORIES.filter((c) => c.id !== "safety"); // 공사진행 탭과 동일하게 안전/환경 제외
const NO_DOCS = []; // 음성 완료를 아직 못 읽었을 때(기본값을 매번 새 배열로 만들면 판정을 계속 다시 만들게 된다)

function firstItemIdFor(categoryId, checklistItems) {
  const first = itemsForCategory(checklistItems, categoryId)[0];
  return first ? first.id : "";
}

// 호실의 선택한 "세부 공종 항목 하나"가 완료인지는 golguStatus.js가 판정한다:
// 감리단이 "공사 확인 요청"을 승인했거나(하도급사의 자체 진행 표시와는 별개), 공종별 QR 등에서 음성으로 "OO동 OO호 OOO 완료"라고 보고한 항목이 완료다.

function normalizeAngle(a) {
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

// 동 하나의 골구도(입면) - 층별로 쌓인 벽돌 그리드가 그대로 건물 정면이 된다.
// 골조공사가 이 호실에서 아직 다 끝나지 않았으면(선택한 항목이 골조가 아닌 경우), 승인된 항목은 색을 채우지 않고
// 호수만 표시한다 - 골조가 없는데 마감·설비 진행도를 색으로 보여주는 건 의미가 없기 때문. (음성으로 완료라고 보고한 항목은 말한 그대로 줄무늬로 보여 준다)
function GolguCard({ building, itemId, categoryId, status, onBrickClick, scale }) {
  const floors = Math.max(1, building.floors || 1);
  const floorNumsAsc = Array.from({ length: floors }, (_, i) => i + 1); // 1층부터 오름차순 - column-reverse와 맞물려 1층이 맨 아래로 감
  const units = unitOptions(building.unitsPerFloor);
  const { width, height, brickH, fontSize } = cardMetrics(building, scale); // 칸·글자 크기는 화면 너비에 맞춘 배율(scale)을 곱해 키운다(golguSize.js)

  const cellData = floorNumsAsc.map((f) =>
    units.map((u) => {
      // 골조 항목을 보는 중이면 그 항목 자체의 승인·음성 완료를 그대로 보여주고,
      // 다른 공종을 보는 중인데 골조가 아직 안 끝났으면 승인된 항목은 "색 없음"(골조 대기) 상태로 표시한다.
      const c = status.cell(building.id, f, u, categoryId, itemId);
      return { floor: f, unit: u, kind: c.kind, unfilled: c.unfilled, by: c.voiceBy };
    })
  );

  return (
    <div className="golgu-card-flat" style={{ width, height }}>
      {cellData.map((row, ri) => (
        <div className="golgu-card-row" key={ri} style={{ height: brickH }}>
          {row.map((cell) => (
            <button
              type="button"
              key={cell.unit}
              className={`golgu-card-brick${cell.kind === "approved" ? " complete" : ""}${cell.kind === "voice" ? " voice" : ""}${cell.unfilled ? " unfilled" : ""}`}
              style={{ fontSize }}
              data-unit={`${cell.floor}${cell.unit}`}
              data-state={cell.kind === "approved" ? "approved" : cell.kind === "voice" ? "voice" : cell.unfilled ? "waiting" : "todo"}
              title={`${building.name} ${cell.floor}층 ${cell.unit}호 · ${
                cell.unfilled
                  ? "골조공사 진행 중(마감·설비 확인 전)"
                  : cell.kind === "approved"
                  ? "완료(감리단 승인)"
                  : cell.kind === "voice"
                  ? `완료(음성 보고${cell.by ? ` · ${cell.by}` : ""}, 감리단 승인 전)`
                  : "미완료"
              } · 클릭하면 호실 정보로 이동`}
              onClick={() => onBrickClick(building.id, cell.floor, cell.unit)}
            >
              {cell.floor}{cell.unit}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * props:
 * - buildings: 전체 동 목록
 * - inspections: 검측(공사 확인 요청) 목록 - 감리단이 승인한 항목은 완료로 집계
 * - checklistItems
 * - voiceDocs / voiceStatus: 음성 보고로 완료라고 말한 항목(unitVoiceDone) 문서들과 읽기 상태("loading" | "ready" | "error") - 이것도 완료로 집계하고 줄무늬로 구분해 보여 준다
 * - onRetryVoice: 읽기에 실패했을 때 다시 시도 / onRecompute: 음성 보고 전체를 다시 읽어 '음성 완료'를 새로 만든다(결과 {reports, units, removed}를 돌려주는 async 함수)
 */
export default function GolguDiagram({ buildings, inspections, checklistItems, onNavigateToUnit, voiceDocs = NO_DOCS, voiceStatus = "ready", onRetryVoice = null, onRecompute = null }) {
  const [categoryId, setCategoryId] = useState(VISIBLE_CATEGORIES[0].id);
  const [itemId, setItemId] = useState(firstItemIdFor(VISIBLE_CATEGORIES[0].id, checklistItems));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const stageRef = useRef(null);
  const dragInfo = useRef(null);
  const dragMoved = useRef(false); // 드래그로 조금이라도 움직였으면, 뗄 때 브릭 클릭(호실 이동)으로 오인하지 않도록
  const [dragging, setDragging] = useState(false);
  const [dragRotation, setDragRotation] = useState(null);
  const [recompute, setRecompute] = useState({ state: "idle", message: "" }); // idle | confirm | running | done | error
  const status = useMemo(() => createStatus({ checklistItems, inspections, voiceDocs }), [checklistItems, inspections, voiceDocs]);
  const totals = useMemo(() => voiceTotals(voiceDocs), [voiceDocs]);

  const n = buildings ? buildings.length : 0;
  const step = n > 0 ? 360 / n : 0;
  const clampedIndex = n > 0 ? ((selectedIndex % n) + n) % n : 0;
  const restRotation = -clampedIndex * step;
  const currentRotation = dragRotation !== null ? dragRotation : restRotation;

  useEffect(() => {
    setDragRotation(null);
  }, [clampedIndex]);

  // 호실 칸 크기: 화면(무대) 너비를 재서 정면 카드가 들어가는 가장 큰 배율을 정한다(넓은 PC 화면은 1.5배, 휴대폰은 그 폭에 맞춰). 화면 폭이 바뀌면 다시 잰다.
  // 너비는 높이가 0인 얇은 띠(golgu-measure)로 잰다 - 무대 높이가 바뀌어도 이 띠의 크기는 변하지 않아서 크기 변화 알림이 끝없이 되풀이되지 않는다.
  const measureRef = useRef(null);
  const [stageWidth, setStageWidth] = useState(0);
  const hasBuildings = n > 0;
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return undefined;
    const read = () => setStageWidth(Math.round(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(read);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, [hasBuildings]);
  const { widest, tallest } = useMemo(() => extremesOf(buildings), [buildings]);
  const scale = fitScale(stageWidth, widest);
  const radius = BASE_RADIUS * scale;
  const stageHeight = stageHeightFor(tallest, scale);

  if (!buildings || buildings.length === 0) return null;

  const categoryItems = itemsForCategory(checklistItems, categoryId);
  const selectedItem = checklistItems.find((i) => i.id === itemId) || null;
  const focusedBuilding = buildings[clampedIndex];

  function handleCategoryChange(id) {
    setCategoryId(id);
    setItemId(firstItemIdFor(id, checklistItems));
  }

  function goPrev() {
    setSelectedIndex((i) => (((i - 1) % n) + n) % n);
  }
  function goNext() {
    setSelectedIndex((i) => (i + 1) % n);
  }

  function handleDownloadExcel() {
    const allItems = VISIBLE_CATEGORIES.flatMap((c) => itemsForCategory(checklistItems, c.id).map((it) => ({ ...it, categoryName: c.name })));
    const header = ["동", "층", "호", ...allItems.map((it) => `[${it.categoryName}] ${it.text}`)];
    const rows = [header];

    buildings.forEach((b) => {
      const floors = Math.max(1, b.floors || 1);
      const units = unitOptions(b.unitsPerFloor);
      for (let f = floors; f >= 1; f--) {
        units.forEach((u) => {
          const row = [b.name, f, u];
          allItems.forEach((it) => {
            const kind = status.itemKind(b.id, f, u, it.id);
            row.push(kind === "approved" ? "완료" : kind === "voice" ? "완료(음성)" : "");
          });
          rows.push(row);
        });
      }
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 8 }, { wch: 6 }, { wch: 6 }, ...allItems.map(() => ({ wch: 16 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "골구도");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `골구도_진행현황_${today}.xlsx`);
  }

  function onPointerDown(e) {
    if (n < 2) return;
    dragInfo.current = { startX: e.clientX, startRotation: currentRotation, pointerId: e.pointerId };
    dragMoved.current = false;
    setDragRotation(currentRotation);
    setDragging(true);
    // 여기서 바로 setPointerCapture를 걸면, 단순 클릭(탭)일 때도 이후의 클릭 이벤트가 이 요소로
    // 넘어와서 브릭 자체의 onClick이 발생하지 않게 된다. 그래서 캡처는 실제로 드래그가 감지된
    // 순간(onPointerMove)에만 시작한다.
  }
  function onPointerMove(e) {
    if (!dragInfo.current) return;
    const dx = e.clientX - dragInfo.current.startX;
    if (!dragMoved.current && Math.abs(dx) > 4) {
      dragMoved.current = true;
      try {
        stageRef.current && stageRef.current.setPointerCapture(dragInfo.current.pointerId);
      } catch {
        /* 캡처 실패해도 회전 자체는 계속 동작하므로 무시 */
      }
    }
    setDragRotation(dragInfo.current.startRotation + dx * 0.5);
  }
  function onPointerUp() {
    if (!dragInfo.current) return;
    dragInfo.current = null;
    setDragging(false);
    const finalRotation = dragRotation ?? restRotation;
    let bestIdx = clampedIndex;
    let bestDiff = Infinity;
    for (let i = 0; i < n; i++) {
      const angle = normalizeAngle(i * step + finalRotation);
      const diff = Math.abs(normalizeAngle(angle));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    setDragRotation(-bestIdx * step);
    setSelectedIndex(bestIdx);
  }

  function handleBrickClick(buildingId, floor, unit) {
    if (dragMoved.current) return; // 방금 드래그했다면(회전 목적) 클릭으로 오인해 이동하지 않음
    if (onNavigateToUnit) onNavigateToUnit(buildingId, floor, unit);
  }

  // 완료 세대 집계는 현재 정면을 보고 있는 동 기준 (승인된 세대 + 음성 보고로만 완료인 세대)
  let approvedCount = 0;
  let voiceOnlyCount = 0;
  const focusedUnits = focusedBuilding ? unitOptions(focusedBuilding.unitsPerFloor).length * Math.max(1, focusedBuilding.floors || 1) : 0;
  if (focusedBuilding && itemId) {
    const units = unitOptions(focusedBuilding.unitsPerFloor);
    for (let f = 1; f <= (focusedBuilding.floors || 1); f++) {
      units.forEach((u) => {
        const kind = status.cell(focusedBuilding.id, f, u, categoryId, itemId).kind;
        if (kind === "approved") approvedCount += 1;
        else if (kind === "voice") voiceOnlyCount += 1;
      });
    }
  }
  const completeCount = approvedCount + voiceOnlyCount;

  async function runRecompute() {
    if (!onRecompute) return;
    setRecompute({ state: "running", message: "" });
    try {
      const res = await onRecompute();
      const removed = res.removed > 0 ? ` 더는 해당되지 않는 ${res.removed}호실은 뺐어요.` : "";
      setRecompute({ state: "done", message: `음성 보고 ${res.reports}건을 읽어 ${res.units}호실을 반영했어요.${removed}` });
    } catch {
      setRecompute({ state: "error", message: "다시 계산하지 못했어요. 연결을 확인하고 다시 시도해 주세요. (기존 값은 그대로예요)" });
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between pb-4 border-b border-slate-100 gap-3 mb-5" data-testid="golgu-head">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Grid3x3 className="w-4 h-4 text-blue-600" aria-hidden="true" />
            골구도 및 공정 히트맵 (Structural Framing Grid)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">전체 동 · 승인되었거나 음성으로 완료 보고된 세대를 층·호수별 바둑판으로 보여 줘요. 호실을 누르면 호실 정보로 이동합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600" data-testid="golgu-legend">
          <span className="inline-flex items-center gap-1.5">
            <span className="golgu-brick" style={{ width: 14, height: 14 }} />
            미완료
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="golgu-brick complete" style={{ width: 14, height: 14 }} />
            완료(승인)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="golgu-brick voice" style={{ width: 14, height: 14 }} />
            완료(음성 보고)
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {VISIBLE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => handleCategoryChange(c.id)}
            className="cat-tag"
            style={{
              cursor: "pointer",
              border: "1.5px solid",
              borderColor: categoryId === c.id ? c.color : "var(--line)",
              background: categoryId === c.id ? c.color + "1c" : "var(--surface)",
              color: categoryId === c.id ? c.color : "var(--ink-soft)",
              padding: "6px 11px",
            }}
          >
            <span className="cat-dot" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      <div className="field" style={{ maxWidth: 340, marginBottom: 14 }}>
        <label>세부 공종 선택</label>
        {categoryItems.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-faint)" }}>등록된 항목이 없습니다.</div>
        ) : (
          <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {categoryItems.map((it) => (
              <option key={it.id} value={it.id}>{it.text}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8, fontSize: 12, flexWrap: "wrap" }}>
        <span style={{ color: "var(--ink-soft)" }} data-testid="golgu-count">
          {focusedBuilding?.name} · {focusedUnits}세대 중 <strong style={{ color: "var(--pass)" }}>{completeCount}세대</strong> 완료
          {voiceOnlyCount > 0 && (
            <span style={{ color: "var(--ink-faint)" }}>
              {" "}
              (승인 {approvedCount} · 음성 보고 {voiceOnlyCount})
            </span>
          )}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={handleDownloadExcel}>
          <Icon.Download width="14" height="14" />
          엑셀 다운로드
        </button>
      </div>
      <div className="golgu-voice-row" data-testid="golgu-voice">
        <span className="golgu-voice-status" data-testid="golgu-voice-status" data-state={voiceStatus}>
          {voiceStatus === "loading"
            ? "음성 보고로 완료된 호실을 불러오는 중…"
            : voiceStatus === "error"
            ? voiceDocs.length > 0
              ? "음성 보고 완료를 새로 불러오지 못했어요. 마지막으로 받은 내용만 표시돼요."
              : "음성 보고 완료를 불러오지 못했어요. 지금은 승인된 호실만 표시돼요."
            : totals.units > 0
            ? `음성 보고로 완료된 호실 ${totals.units}곳(항목 ${totals.items}개)이 반영돼 있어요.`
            : "아직 음성으로 완료 보고된 호실이 없어요. 이 기능이 생기기 전의 음성 보고는 ‘다시 계산’으로 반영할 수 있어요."}
        </span>
        {voiceStatus === "error" && onRetryVoice && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRetryVoice} data-testid="golgu-voice-retry">
            다시 불러오기
          </button>
        )}
        {onRecompute && recompute.state !== "confirm" && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setRecompute({ state: "confirm", message: "" })}
            disabled={recompute.state === "running"}
            data-testid="golgu-recompute"
          >
            {recompute.state === "running" ? "계산 중…" : "다시 계산"}
          </button>
        )}
      </div>
      {recompute.state === "confirm" && (
        <div className="golgu-recompute-confirm" data-testid="golgu-recompute-confirm" role="alertdialog" aria-label="음성 완료 다시 계산">
          <div>
            저장된 음성 보고를 모두 다시 읽어서 ‘음성 완료’를 새로 만들어요. 보고가 많으면 시간이 걸리고 데이터 읽기 횟수가 늘어요.
            호실 정보에서 진행도에서 뺀 보고는 반영되지 않아요. 계속할까요?
          </div>
          <div className="golgu-recompute-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={runRecompute} data-testid="golgu-recompute-go">
              다시 계산 시작
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRecompute({ state: "idle", message: "" })} data-testid="golgu-recompute-cancel">
              취소
            </button>
          </div>
        </div>
      )}
      {recompute.message && (
        <div className={`golgu-recompute-msg${recompute.state === "error" ? " is-error" : ""}`} data-testid="golgu-recompute-msg" role="status">
          {recompute.message}
        </div>
      )}
      <div className="golgu-carousel-outer">
        <div ref={measureRef} className="golgu-measure" aria-hidden="true" />
        <div
          ref={stageRef}
          className="golgu-carousel-stage"
          data-scale={scale}
          style={{ height: stageHeight, perspective: PERSPECTIVE * scale, "--gk": scale, "--gl": Math.min(scale, 1.3) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="golgu-carousel-turntable" />
          <div
            className="golgu-carousel-ring"
            style={{ transform: `rotateY(${currentRotation}deg)`, transition: dragging ? "none" : "transform 0.4s cubic-bezier(0.2,0.8,0.3,1)" }}
          >
            {buildings.map((b, i) => {
              const angle = i * step;
              const isFocused = i === clampedIndex;
              return (
                <div
                  key={b.id}
                  className="golgu-carousel-item"
                  style={{ transform: `rotateY(${angle}deg) translateZ(${radius}px)`, pointerEvents: isFocused ? "auto" : "none" }}
                >
                  <div className="golgu-card-wrap">
                    <GolguCard building={b} itemId={itemId} categoryId={categoryId} status={status} onBrickClick={handleBrickClick} scale={scale} />
                    <div className="golgu-card-name" style={{ transform: `rotateY(${-(angle + currentRotation)}deg)` }}>
                      {b.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="golgu-nav-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goPrev} disabled={n < 2}>
            <Icon.ChevronRight width="15" height="15" style={{ transform: "rotate(180deg)" }} />
            이전
          </button>
          <span className="mono golgu-nav-count">{clampedIndex + 1} / {n}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={goNext} disabled={n < 2}>
            다음
            <Icon.ChevronRight width="15" height="15" />
          </button>
        </div>
        {n > 1 && <div className="golgu-scroll-hint">좌우로 드래그하거나 버튼을 눌러 다른 동을 볼 수 있어요</div>}
      </div>

      <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2" data-testid="golgu-note">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-px" aria-hidden="true" />
        <span>
          감리단이 "공사 확인 요청"을 승인한 호실과, 공종별 QR에서 음성으로 “OO동 OO호 OOO 완료”라고 보고한 호실이 완료로 표시됩니다(줄무늬는 음성 보고만 있는 완료).
          호실 정보에서 보고를 진행도에서 뺀 경우에는 여기서도 빠집니다.
          {categoryId !== "frame" && " 골조공사가 끝나지 않은 호실은 마감·설비 공종에서 승인된 항목이 색 없이(호수만) 표시됩니다."}
        </span>
      </div>
    </div>
  );
}
