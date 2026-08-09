import React, { useState } from "react";
import { CATEGORIES } from "../data.js";
import { Icon } from "./UI.jsx";

export default function Checklist() {
  const [openId, setOpenId] = useState(CATEGORIES[0].id);

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 22 }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setOpenId(c.id)}
            className="card"
            style={{
              padding: "16px 16px",
              textAlign: "left",
              cursor: "pointer",
              borderColor: openId === c.id ? c.color : undefined,
              borderWidth: openId === c.id ? 2 : 1,
              boxShadow: openId === c.id ? `0 0 0 3px ${c.color}22` : undefined,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, display: "inline-block" }} />
              <span className="eyebrow">{c.items.length}개 항목</span>
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>{c.description}</div>
          </button>
        ))}
      </div>

      {CATEGORIES.filter((c) => c.id === openId).map((c) => (
        <div className="card card-pad" key={c.id}>
          <div className="section-head">
            <div className="section-title">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, display: "inline-block" }} />
              {c.name} 표준 체크리스트
            </div>
            <span className="eyebrow mono">TEMPLATE · {c.id.toUpperCase()}</span>
          </div>
          <div className="grid grid-2">
            {c.items.map((item, i) => (
              <div key={item.id} style={{ display: "flex", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--line)" }}>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)", paddingTop: 1 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 13.5 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "flex-start", color: "var(--ink-soft)", fontSize: 12.5 }}>
        <Icon.Bell width="15" height="15" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>이 템플릿은 검측관리 탭에서 검측 요청을 작성할 때 자동으로 불러와 항목별로 체크할 수 있습니다.</span>
      </div>
    </div>
  );
}
