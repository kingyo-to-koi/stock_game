import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  Timestamp,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

/** 종목 타입: 가격/예약 관련 필드 추가 */
type Stock = {
  id: string;
  name: string;
  description: string;
  basePrice: number; // 기준가 (필수)
  deltaPct: number; // 현재 등락률(%)
  order?: number;
  isPublished?: boolean;
  scheduledDelta?: number | null; // 예약 등락률
  applyAt?: any | null; // 예약 적용 시각
};

/** 뉴스 큐 타입: 5개 슬롯 관리용 */
type QueuedNews = {
  id: string; // 'n1' ~ 'n5'
  order: number; // 1~5
  headline: string;
  body: string;
  publishAt: any | null; // Timestamp | null
};

/** datetime-local <-> Date 헬퍼 */
const toInputValue = (d?: Date | null) => {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};
const fromInputValue = (v: string) => (v ? new Date(v) : null);
const toDateSafe = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(+d) ? null : d;
  }
  return null;
};

export default function AdminView() {
  // ─────────────────────────────────────────────────────────────
  // 뉴스 5개 시퀀스 상태 (n1~n5)
  // ─────────────────────────────────────────────────────────────
  const initialQueue: QueuedNews[] = [
    { id: "n1", order: 1, headline: "", body: "", publishAt: null },
    { id: "n2", order: 2, headline: "", body: "", publishAt: null },
    { id: "n3", order: 3, headline: "", body: "", publishAt: null },
    { id: "n4", order: 4, headline: "", body: "", publishAt: null },
    { id: "n5", order: 5, headline: "", body: "", publishAt: null },
  ];
  const [queue, setQueue] = useState<QueuedNews[]>(initialQueue);

  // 실시간 구독: newsQueue 불러와 폼에 채움
  useEffect(() => {
    const qRef = query(collection(db, "newsQueue"), orderBy("order", "asc"));
    const unsub = onSnapshot(qRef, (snap) => {
      const arr: QueuedNews[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      // 비어있는 슬롯은 initialQueue로 유지
      const merged = initialQueue.map((slot) => {
        const found = arr.find((x) => x.id === slot.id);
        return found ? found : slot;
      });
      setQueue(merged);
    });
    return () => unsub();
  }, []);

  // 뉴스 저장 (슬롯 단위 저장)
  const saveNewsSlot = async (slot: QueuedNews) => {
    await setDoc(
      doc(db, "newsQueue", slot.id),
      {
        order: slot.order,
        headline: slot.headline,
        body: slot.body,
        publishAt: slot.publishAt
          ? Timestamp.fromDate(
              typeof slot.publishAt?.toDate === "function"
                ? slot.publishAt.toDate()
                : new Date(slot.publishAt)
            )
          : null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    alert(`${slot.id.toUpperCase()} 저장 완료`);
  };

  // 한 번에 모두 저장
  const saveAllNewsSlots = async () => {
    await Promise.all(
      queue.map((slot) =>
        setDoc(
          doc(db, "newsQueue", slot.id),
          {
            order: slot.order,
            headline: slot.headline,
            body: slot.body,
            publishAt: slot.publishAt
              ? Timestamp.fromDate(
                  typeof slot.publishAt?.toDate === "function"
                    ? slot.publishAt.toDate()
                    : new Date(slot.publishAt)
                )
              : null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        )
      )
    );
    alert("뉴스 5개 일괄 저장 완료");
  };

  // ─────────────────────────────────────────────────────────────
  // 종목 상태 (가격 + 등락률 + 예약)
  // ─────────────────────────────────────────────────────────────
  const [stocks, setStocks] = useState<Stock[]>([]);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "stocks"));
      const arr: Stock[] = [];
      snap.forEach((d) =>
        arr.push({
          basePrice: 0, // 안전 기본값
          ...({ id: d.id, ...(d.data() as any) } as any),
        } as Stock)
      );
      setStocks(arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    })();
  }, []);

  const addStock = async () => {
    const id = prompt(
      "문서 ID 입력(영문/숫자):",
      "stock-" + Math.random().toString(36).slice(2, 6)
    );
    if (!id) return;
    await setDoc(doc(db, "stocks", id), {
      name: "새 종목",
      description: "설명",
      basePrice: 1000, // 기본가
      deltaPct: 0,
      order: (stocks.at(-1)?.order ?? 0) + 1,
      isPublished: true,
      scheduledDelta: null,
      applyAt: null,
      updatedAt: serverTimestamp(),
    });
    location.reload();
  };

  const saveStock = async (s: Stock) => {
    let applyAt: Timestamp | null = null;
    if (s.applyAt) {
      if (typeof (s.applyAt as any)?.toDate === "function") {
        applyAt = s.applyAt as Timestamp;
      } else if (s.applyAt instanceof Date) {
        applyAt = Timestamp.fromDate(s.applyAt);
      } else if (typeof s.applyAt === "string") {
        const d = fromInputValue(s.applyAt);
        applyAt = d ? Timestamp.fromDate(d) : null;
      }
    }

    await updateDoc(doc(db, "stocks", s.id), {
      name: s.name,
      description: s.description,
      basePrice: Number(s.basePrice),
      deltaPct: Number(s.deltaPct),
      order: s.order ?? null,
      isPublished: s.isPublished ?? true,
      scheduledDelta: s.scheduledDelta ?? null,
      applyAt,
      updatedAt: serverTimestamp(),
    } as any);
    alert("종목 저장됨");
  };

  const removeStock = async (id: string) => {
    if (!confirm("삭제?")) return;
    await deleteDoc(doc(db, "stocks", id));
    location.reload();
  };

  // 현재 어떤 뉴스가 노출될지 미리보기
  const previewCurrentNews = useMemo(() => {
    const now = new Date();
    const withDate = queue
      .filter((q) => q.publishAt)
      .map((q) => ({ ...q, d: toDateSafe(q.publishAt)! }))
      .filter((q) => q.d && now >= q.d)
      .sort((a, b) => +a.d - +b.d);
    return withDate.at(-1) ?? null;
  }, [queue]);

  return (
    <div className="min-h-screen newspaper-bg p-6">
      <div className="max-w-4xl mx-auto card-nb p-6">
        <h2 className="text-xl font-bold mb-4">운영자 콘솔</h2>

        {/* ──────────────────────────────────────────
            뉴스 5개 예약 시퀀스
           ────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">뉴스 예약 (5개 시퀀스)</h3>
            <button className="btn-primary" onClick={saveAllNewsSlots}>
              전체 저장
            </button>
          </div>

          <div className="grid gap-3">
            {queue.map((slot) => {
              const publishAtInput = slot.publishAt
                ? toInputValue(toDateSafe(slot.publishAt))
                : "";
              return (
                <div key={slot.id} className="card-nb p-3">
                  <div className="text-sm text-zinc-500 mb-1">
                    {slot.id.toUpperCase()} (순서 {slot.order})
                  </div>
                  <input
                    className="input mb-2"
                    placeholder="헤드라인"
                    value={slot.headline}
                    onChange={(e) =>
                      setQueue((p) =>
                        p.map((x) =>
                          x.id === slot.id
                            ? { ...x, headline: e.target.value }
                            : x
                        )
                      )
                    }
                  />
                  <textarea
                    className="input mb-2"
                    rows={3}
                    placeholder="본문"
                    value={slot.body}
                    onChange={(e) =>
                      setQueue((p) =>
                        p.map((x) =>
                          x.id === slot.id ? { ...x, body: e.target.value } : x
                        )
                      )
                    }
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm text-zinc-600">
                        노출 시각 (publishAt)
                      </label>
                      <input
                        type="datetime-local"
                        className="input"
                        value={publishAtInput}
                        onChange={(e) =>
                          setQueue((p) =>
                            p.map((x) =>
                              x.id === slot.id
                                ? {
                                    ...x,
                                    publishAt:
                                      e.target.value === ""
                                        ? null
                                        : new Date(e.target.value),
                                  }
                                : x
                            )
                          )
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        className="btn-ghost"
                        onClick={() => saveNewsSlot(slot)}
                      >
                        이 슬롯만 저장
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 현재 시각 기준 노출 미리보기 */}
          <div className="mt-3 text-sm text-zinc-600">
            현재 시각 기준 노출 예정:{" "}
            <span className="font-medium">
              {previewCurrentNews
                ? `${previewCurrentNews.id.toUpperCase()} — ${
                    previewCurrentNews.headline || "(제목 없음)"
                  }`
                : "예약된 뉴스가 아직 없습니다."}
            </span>
          </div>
        </div>

        {/* ──────────────────────────────────────────
            종목 관리 (가격 + 등락률 + 예약 등락)
           ────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">종목 관리</h3>
          <button className="btn-ghost" onClick={addStock}>
            + 종목 추가
          </button>
        </div>

        <div className="grid gap-3">
          {stocks.map((s, i) => {
            const applyAtInput = s.applyAt?.toDate
              ? toInputValue(s.applyAt.toDate())
              : s.applyAt instanceof Date
              ? toInputValue(s.applyAt)
              : typeof s.applyAt === "string"
              ? s.applyAt
              : "";

            return (
              <div key={s.id} className="card-nb p-3">
                {/* 1행: 기본 필드 */}
                <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_100px_80px] gap-2">
                  <input
                    className="input"
                    placeholder="종목명"
                    value={s.name}
                    onChange={(e) =>
                      setStocks((p) =>
                        p.map((x) =>
                          x.id === s.id ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                  />
                  <input
                    className="input"
                    placeholder="설명"
                    value={s.description}
                    onChange={(e) =>
                      setStocks((p) =>
                        p.map((x) =>
                          x.id === s.id
                            ? { ...x, description: e.target.value }
                            : x
                        )
                      )
                    }
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="등락%"
                    value={s.deltaPct}
                    onChange={(e) =>
                      setStocks((p) =>
                        p.map((x) =>
                          x.id === s.id
                            ? { ...x, deltaPct: Number(e.target.value) }
                            : x
                        )
                      )
                    }
                  />
                  <input
                    type="number"
                    className="input"
                    placeholder="정렬"
                    value={s.order ?? i + 1}
                    onChange={(e) =>
                      setStocks((p) =>
                        p.map((x) =>
                          x.id === s.id
                            ? { ...x, order: Number(e.target.value) }
                            : x
                        )
                      )
                    }
                  />
                </div>

                {/* 2행: 가격 + 예약 */}
                <div className="mt-2 grid grid-cols-1 md:grid-cols-[140px_140px_1fr] gap-2">
                  <div>
                    <label className="text-sm text-zinc-600">기준가</label>
                    <input
                      type="number"
                      className="input"
                      value={s.basePrice}
                      onChange={(e) =>
                        setStocks((p) =>
                          p.map((x) =>
                            x.id === s.id
                              ? { ...x, basePrice: Number(e.target.value) }
                              : x
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-600">
                      예약 등락률(%)
                    </label>
                    <input
                      type="number"
                      className="input"
                      placeholder="예: 12"
                      value={s.scheduledDelta ?? ""}
                      onChange={(e) =>
                        setStocks((p) =>
                          p.map((x) =>
                            x.id === s.id
                              ? {
                                  ...x,
                                  scheduledDelta:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                }
                              : x
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-600">적용 시각</label>
                    <input
                      type="datetime-local"
                      className="input"
                      value={applyAtInput}
                      onChange={(e) =>
                        setStocks((p) =>
                          p.map((x) =>
                            x.id === s.id
                              ? { ...x, applyAt: e.target.value }
                              : x
                          )
                        )
                      }
                    />
                  </div>
                </div>

                <div className="mt-2 flex gap-2">
                  <button className="btn-primary" onClick={() => saveStock(s)}>
                    저장
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => removeStock(s.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            );
          })}
          {stocks.length === 0 && (
            <div className="text-zinc-500">종목 없음</div>
          )}
        </div>
      </div>
    </div>
  );
}
