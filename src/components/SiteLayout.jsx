import React, { useCallback, useEffect, useState } from "react";
import { EmptyState } from "./UI.jsx";
import GolguDiagram from "./GolguDiagram.jsx";
import * as api from "../api.js";
import { progressByUnit, doneMapOf } from "../unitProgress.js";

// 골구도 탭. 감리단 승인에 더해, 공종별 QR 등에서 음성으로 "OO동 OO호 OOO 완료"라고 보고한 항목(unitVoiceDone)도 완료로 보여 준다.
// 이 탭이 열려 있는 동안 음성 완료를 실시간으로 받는다(현장에서 새로 보고하면 바로 칠해진다).
export default function SiteLayout({ buildings, checklistItems, inspections, onNavigateToUnit }) {
  const [voice, setVoice] = useState({ status: "loading", docs: [] }); // status: loading | ready | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setVoice((prev) => ({ status: "loading", docs: prev.docs }));
    const stop = api.subscribeUnitVoiceDone(
      (docs) => setVoice({ status: "ready", docs }),
      () => setVoice((prev) => ({ status: "error", docs: prev.docs }))
    );
    return stop;
  }, [attempt]);

  const retryVoice = useCallback(() => setAttempt((n) => n + 1), []);

  // '다시 계산': 저장된 음성 보고 전체를 읽어 호실마다 '완료'를 처음부터 다시 만들어 저장한다(이 기능이 생기기 전의 보고를 반영할 때, 용어 표를 다시 적용한 뒤에 쓴다).
  // 반영한 내용은 위의 실시간 구독으로 바로 화면에 보인다.
  const recompute = useCallback(async () => {
    const reports = await api.fetchAllVoiceReports();
    const progress = progressByUnit(reports, buildings, checklistItems);
    const docs = [];
    for (const u of progress.values()) {
      const items = doneMapOf(u);
      if (Object.keys(items).length > 0) docs.push({ buildingId: u.buildingId, floor: u.floor, unit: u.unit, items });
    }
    const res = await api.rebuildUnitVoiceDone(docs);
    return { reports: reports.length, units: res.written, removed: res.removed };
  }, [buildings, checklistItems]);

  if (buildings.length === 0) {
    return (
      <div className="card">
        <EmptyState message="먼저 동 관리 탭에서 동을 등록해주세요." />
      </div>
    );
  }

  return (
    <div className="card card-pad" data-testid="golgu-card">
      <GolguDiagram
        buildings={buildings}
        inspections={inspections}
        checklistItems={checklistItems}
        onNavigateToUnit={onNavigateToUnit}
        voiceDocs={voice.docs}
        voiceStatus={voice.status}
        onRetryVoice={retryVoice}
        onRecompute={recompute}
      />
    </div>
  );
}
