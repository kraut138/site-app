import React, { useState, useMemo } from "react";
import { CATEGORIES, formatDateTime } from "../data.js";
import { Icon, StatusBadge, CategoryTag, EmptyState } from "./UI.jsx";

export default function Workers({ workers, onCreateWorkers, notify }) {
  const [companyName, setCompanyName] = useState("");
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const [nameInput, setNameInput] = useState("");
  const [names, setNames] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const knownCompanies = useMemo(() => [...new Set(workers.map((w) => w.companyName))], [workers]);

  function addName() {
    const trimmed = nameInput.trim();
    if (!trimmed || names.includes(trimmed)) {
      setNameInput("");
      return;
    }
    setNames((prev) => [...prev, trimmed]);
    setNameInput("");
  }

  function handleNameKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addName();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("건설사 이름을 입력해주세요.");
      return;
    }
    const finalNames = nameInput.trim() && !names.includes(nameInput.trim()) ? [...names, nameInput.trim()] : names;
    if (finalNames.length === 0) {
      setError("등록할 인력 이름을 1명 이상 입력해주세요.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreateWorkers({ companyName: companyName.trim(), categoryId, names: finalNames });
      setNames([]);
      setNameInput("");
      notify(`${finalNames.length}명의 인력을 등록 요청했습니다.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sortedWorkers = [...workers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>인력 등록</div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>건설사 이름</label>
            <input
              className="input"
              list="company-datalist"
              placeholder="예: 대한철근"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <datalist id="company-datalist">
              {knownCompanies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>공종 선택</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CATEGORIES.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className="cat-tag"
                  style={{
                    cursor: "pointer",
                    border: "1.5px solid",
                    borderColor: categoryId === c.id ? c.color : "var(--line)",
                    background: categoryId === c.id ? c.color + "1c" : "var(--surface)",
                    color: categoryId === c.id ? c.color : "var(--ink-soft)",
                    padding: "7px 12px",
                  }}
                >
                  <span className="cat-dot" style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>현장 인력 이름 (입력 후 Enter로 추가, 여러 명 등록 가능)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="예: 김철수"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={handleNameKeyDown}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-ghost" onClick={addName}>
                <Icon.Plus width="14" height="14" /> 추가
              </button>
            </div>
            {names.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {names.map((n, i) => (
                  <span key={i} className="chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {n}
                    <button
                      type="button"
                      onClick={() => setNames(names.filter((_, idx) => idx !== i))}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-faint)", padding: 0, fontSize: 12 }}
                      aria-label={`${n} 제거`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{ color: "var(--fail)", fontSize: 12.5, marginBottom: 12 }}>{error}</div>}

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "등록 중…" : "인력 등록 요청"}
          </button>
        </form>
      </div>

      <div className="card">
        <div style={{ padding: "16px 20px 4px" }}>
          <div className="section-title">등록 현황</div>
        </div>
        {sortedWorkers.length === 0 ? (
          <EmptyState message="등록된 인력이 없습니다." />
        ) : (
          sortedWorkers.map((w) => {
            const cat = CATEGORIES.find((c) => c.id === w.categoryId);
            return (
              <div className="list-row" key={w.id} style={{ cursor: "default" }}>
                <span className="loc">{w.companyName}</span>
                <div className="grow">
                  <div className="title">{w.workerName}</div>
                  <div className="meta">{formatDateTime(w.createdAt)}</div>
                </div>
                <CategoryTag category={cat} />
                <StatusBadge status={w.status} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
