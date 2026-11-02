import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// 접기/펼치기 단추와, 접어 둔 상태를 이 기기에 기억하는 훅. 공종별 진행률을 보여 주는 카드들(대시보드 · 호실 정보)이 같이 쓴다.
// 접은 상태는 이 기기의 브라우저에만 남기고(서버에는 저장하지 않는다) 다음에 열어도 그대로다.
// 브라우저가 저장을 막아 둔 경우(개인정보 보호 모드 등)에는 저장 없이 그 화면을 보는 동안만 기억한다.
const KEY_PREFIX = "sitetong.fold.";

function readFolded(key) {
  try {
    return window.localStorage.getItem(KEY_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeFolded(key, folded) {
  try {
    if (folded) window.localStorage.setItem(KEY_PREFIX + key, "1");
    else window.localStorage.removeItem(KEY_PREFIX + key);
  } catch {
    // 저장하지 못해도 화면은 그대로 동작한다
  }
}

// 사용: const [folded, toggle] = useFolded("이름"); - 처음에는 펼친 상태다.
export function useFolded(key) {
  const [folded, setFolded] = useState(() => readFolded(key));
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    writeFolded(key, next);
  };
  return [folded, toggle];
}

// label: 접는 대상의 이름(화면 낭독기용). controls: 접고 펼치는 영역의 id.
export default function FoldToggle({ folded, onToggle, label, controls, testId }) {
  const Chevron = folded ? ChevronDown : ChevronUp;
  const text = folded ? "펼치기" : "접기";
  return (
    <button
      type="button"
      className="fold-toggle"
      onClick={onToggle}
      aria-expanded={!folded}
      aria-controls={controls}
      aria-label={`${label} ${text}`}
      data-testid={testId}
      data-folded={folded ? "true" : "false"}
    >
      <Chevron width="14" height="14" aria-hidden="true" />
      {text}
    </button>
  );
}
