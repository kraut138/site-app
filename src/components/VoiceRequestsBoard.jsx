import React, { useEffect, useMemo, useState } from "react";
import { Icon, EmptyState } from "./UI.jsx";
import { VoiceRecordMeta } from "./VoiceAudio.jsx";
import { formatDateTime } from "../data.js";
import { findTrade, tradeName, convertedText } from "../voice.js";
import { resolveUnit } from "../unitProgress.js";
import * as api from "../api.js";

// "4. 공사 확인 음성요청 내역" - 하도급 반장이 모바일 모드에서 남긴 음성 보고(voiceReports) 전부를,
// 말한 글에서 동·호수를 스스로 판별해(resolveUnit, 호실 정보 화면과 같은 로직) 동·호수 칸으로 모아 보여 준다.
// 칸을 클릭하면 그 호실에 쌓인 모든 기록(원문 · 순화한 문장 · 요약 · 작성자 · 시간)을 한 번에 확인할 수 있다.
// 동·층·부재만으로는 호실이 판별되지 않는 기록(여러 호실이 함께 언급되었거나 호실 표현이 아예 없는 경우)은
// "호실 미확인" 칸에 따로 모아, 어떤 기록도 빠짐없이 확인할 수 있게 한다.

const LOAD_COUNT = 4000; // 최근 기록부터 최대 이만큼 읽어 전부(사실상 전체) 모은다

// 승인·반려를 하지 않은 보고는 모두 '승인 대기'다(approval 필드가 없는 예전 기록 포함).
const isPending = (r) => r.approval !== "approved" && r.approval !== "rejected";

export default function VoiceRequestsBoard({ buildings, notify, adminName = "" }) {
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [reports, setReports] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [selectedBuilding, setSelectedBuilding] = useState(null); // 열어 본 동 이름(없으면 동 목록을 보여 준다)

  useEffect(() => {
    setStatus("loading");
    const unsub = api.subscribeRecentVoiceReports(
      LOAD_COUNT,
      (list) => {
        setReports(list);
        setStatus("ready");
      },
      () => {
        setStatus("error");
        if (notify) notify("음성요청 내역을 불러오지 못했습니다. 연결을 확인해 주세요.");
      }
    );
    return () => unsub && unsub();
  }, [notify]);

  const buildingById = useMemo(() => {
    const m = new Map();
    (buildings || []).forEach((b) => m.set(b.id, b));
    return m;
  }, [buildings]);

  // 동·호수 칸으로 묶기. 판별되지 않는 기록은 따로 모아 둔다(하나도 빠뜨리지 않기 위해).
  const groups = useMemo(() => {
    const map = new Map();
    const unresolved = [];
    reports.forEach((r) => {
      const building = buildingById.get(r.buildingId);
      const unitsPerFloor = building ? building.unitsPerFloor : 0;
      const resolved = resolveUnit(r, { unitsPerFloor });
      if (resolved.ok) {
        const key = resolved.key;
        if (!map.has(key)) {
          map.set(key, {
            key,
            buildingName: r.buildingName || (building && building.name) || "",
            floor: resolved.floor,
            unit: resolved.unit,
            records: [],
            pending: 0,
          });
        }
        map.get(key).records.push(r);
        if (isPending(r)) map.get(key).pending += 1;
      } else {
        unresolved.push(r);
      }
    });
    const list = Array.from(map.values());
    list.forEach((g) => g.records.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    // 층(숫자) 순서, 같은 층에서는 호수(숫자) 순서로 정렬한다. 예: 1층 01호 → 1층 02호 → 2층 01호
    list.sort((a, b) => {
      if (a.floor !== b.floor) return a.floor - b.floor;
      return String(a.unit).localeCompare(String(b.unit), "ko", { numeric: true });
    });
    // 같은 동끼리 묶는다(동 이름 순서, 숫자는 크기 순서). 각 동 안의 호실은 위에서 정렬한 순서를 그대로 쓴다.
    const byBuilding = new Map();
    list.forEach((g) => {
      const name = g.buildingName || "동 미확인";
      if (!byBuilding.has(name)) byBuilding.set(name, { name, units: [], count: 0, pending: 0 });
      const b = byBuilding.get(name);
      b.units.push(g);
      b.count += g.records.length;
      b.pending += g.pending;
    });
    const buildingList = Array.from(byBuilding.values()).sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
    unresolved.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return { list, buildings: buildingList, unresolved };
  }, [reports, buildingById]);

  const selectedGroup = useMemo(() => groups.list.find((g) => g.key === selectedKey) || null, [groups.list, selectedKey]);
  const showUnresolved = selectedKey === "__unresolved__";
  const openBuilding = useMemo(() => groups.buildings.find((b) => b.name === selectedBuilding) || null, [groups.buildings, selectedBuilding]);

  if (status === "loading") {
    return (
      <div className="card" style={{ padding: "32px 20px", textAlign: "center", color: "var(--ink-faint)", fontSize: 13 }}>
        불러오는 중…
      </div>
    );
  }
  if (status === "error") {
    return <EmptyState message="음성요청 내역을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요." />;
  }

  const totalCount = reports.length;

  return (
    <div className="vr-board">
      <div className="card vr-board-head">
        <div className="section-title">
          {openBuilding
            ? `${openBuilding.name} 음성요청 내역 (${openBuilding.units.length}개 호실 · ${openBuilding.count}건)`
            : `동별 음성요청 내역 (${groups.buildings.length}개 동 · ${groups.list.length}개 호실 · 총 ${totalCount}건)`}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 4 }}>
          {openBuilding
            ? "층과 호수 순서로 정렬했습니다. 호실 칸을 클릭하면 그 호실의 기록을 모두 확인할 수 있습니다."
            : "하도급 반장이 남긴 음성 보고를 동별로 묶었습니다. 동을 클릭하면 층·호수 순서로 호실이 나옵니다."}
        </div>
      </div>

      {groups.list.length === 0 && groups.unresolved.length === 0 ? (
        <EmptyState message="아직 접수된 음성요청이 없습니다." />
      ) : (
        <div className="vr-grid">
          {openBuilding ? (
            <>
              <button
                type="button"
                className="vr-cell vr-back"
                onClick={() => {
                  setSelectedBuilding(null);
                  setSelectedKey(null);
                }}
              >
                <span className="vr-cell-loc">← 전체 동 보기</span>
              </button>
              {openBuilding.units.map((g) => (
                <button
                  type="button"
                  key={g.key}
                  className={`vr-cell${selectedKey === g.key ? " is-active" : ""}`}
                  onClick={() => setSelectedKey(selectedKey === g.key ? null : g.key)}
                >
                  <span className="vr-cell-loc">
                    <Icon.Pin width="13" height="13" />
                    {g.floor}층 {g.unit}호
                  </span>
                  <span className="vr-cell-foot">
                    <span className="vr-cell-count">{g.records.length}건</span>
                    {g.pending > 0 && <span className="vr-cell-pending">· 승인 대기중</span>}
                  </span>
                </button>
              ))}
            </>
          ) : (
            groups.buildings.map((b) => (
              <button
                type="button"
                key={b.name}
                className="vr-cell"
                onClick={() => {
                  setSelectedBuilding(b.name);
                  setSelectedKey(null);
                }}
              >
                <span className="vr-cell-loc">
                  <Icon.Pin width="13" height="13" />
                  {b.name}
                </span>
                <span className="vr-cell-foot">
                  <span className="vr-cell-count">
                    {b.units.length}개 호실 · {b.count}건
                  </span>
                  {b.pending > 0 && <span className="vr-cell-pending">· 승인 대기중</span>}
                </span>
              </button>
            ))
          )}
          {!openBuilding && groups.unresolved.length > 0 && (
            <button
              type="button"
              className={`vr-cell is-unresolved${showUnresolved ? " is-active" : ""}`}
              onClick={() => setSelectedKey(showUnresolved ? null : "__unresolved__")}
            >
              <span className="vr-cell-loc">
                <Icon.Pin width="13" height="13" />
                호실 미확인
              </span>
              <span className="vr-cell-foot">
                <span className="vr-cell-count">{groups.unresolved.length}건</span>
                {groups.unresolved.some(isPending) && <span className="vr-cell-pending">· 승인 대기중</span>}
              </span>
            </button>
          )}
        </div>
      )}

      {(selectedGroup || showUnresolved) && (
        <div className="card vr-detail">
          <div className="vr-detail-head">
            <div className="section-title">
              {showUnresolved
                ? "호실 미확인 음성요청"
                : `${selectedGroup.buildingName} ${selectedGroup.floor}층 ${selectedGroup.unit}호`}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedKey(null)}>
              닫기
            </button>
          </div>
          {showUnresolved && (
            <div style={{ fontSize: 12, color: "var(--ink-faint)", margin: "4px 0 12px" }}>
              말한 글에서 동·호수가 분명하게 판별되지 않은 기록입니다. 내용을 확인한 뒤 필요하면 해당 호실을 직접 찾아 알려 주세요.
            </div>
          )}
          <div className="vr-detail-list">
            {(showUnresolved ? groups.unresolved : selectedGroup.records).map((r) => (
              <VoiceRequestCard key={r.id} report={r} adminName={adminName} notify={notify} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceRequestCard({ report, adminName = "", notify }) {
  const r = report;
  const [busy, setBusy] = useState(false);
  const approval = r.approval === "approved" || r.approval === "rejected" ? r.approval : "";
  // 승인·반려를 저장한다. 실시간 구독이 곧 바뀐 값을 가져와 화면과 목록의 '승인 대기중' 표시가 함께 바뀐다. status "" = 승인 대기로 되돌림.
  async function decide(status) {
    if (busy) return;
    setBusy(true);
    try {
      await api.setVoiceReportApproval(r.id, status, adminName);
    } catch {
      if (notify) notify("승인·반려를 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  const trade = findTrade(r.trade);
  return (
    <article className="vl-card" style={{ "--vl": trade ? trade.color : "var(--line-strong)" }}>
      <header className="vl-card-head">
        {trade && <span className="vl-card-trade">{tradeName(trade.id) || trade.id}</span>}
        <strong>{r.author || "이름 없음"}</strong>
        {r.via === "text" && <span className="vl-card-via">직접 입력</span>}
        <time className="vl-card-time">{formatDateTime(r.createdAt)}</time>
      </header>
      <div className="vl-card-loc">
        <Icon.Pin width="13" height="13" />
        {r.buildingName ? `${r.buildingName} ` : ""}
        {r.floor}층 · {r.elem}
      </div>
      <div className="vl-card-raw">“{r.rawText}”</div>
      {convertedText(r) && convertedText(r) !== r.rawText && (
        <div className="vl-card-norm">
          <span aria-hidden="true">→ </span>
          {convertedText(r)}
        </div>
      )}
      {r.summary && <div className="vl-card-summary">{r.summary}</div>}
      <VoiceRecordMeta report={r} prefix="vr" />
      <footer className="vr-approve" data-testid={`vr-approve-${r.id}`}>
        {approval ? (
          <>
            <span className={`vr-approve-state is-${approval}`}>
              {approval === "approved" ? "승인됨" : "반려됨"}
              {r.approvalBy ? ` · ${r.approvalBy}` : ""}
              {r.approvalAt ? ` · ${formatDateTime(r.approvalAt)}` : ""}
            </span>
            <button type="button" className="vr-approve-undo" disabled={busy} onClick={() => decide("")}>
              취소
            </button>
          </>
        ) : (
          <>
            <button type="button" className="vr-approve-btn is-approve" disabled={busy} onClick={() => decide("approved")} data-testid="vr-approve">
              승인
            </button>
            <button type="button" className="vr-approve-btn is-reject" disabled={busy} onClick={() => decide("rejected")} data-testid="vr-reject">
              반려
            </button>
          </>
        )}
      </footer>
    </article>
  );
}
