import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

/** 뉴스 큐 타입: 러너는 현재 시각에 맞는 한 개만 노출 */
type QueuedNews = {
  id: string;
  order: number;
  headline?: string;
  body?: string;
  publishAt?: any | null; // Timestamp | null
};

type Stock = {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  deltaPct: number;
  sector?: string; // ✅ 업종
  isPublished?: boolean;
  scheduledDelta?: number | null;
  applyAt?: any | null;
};

const pctColor = (p: number) =>
  p > 0 ? "text-green-600" : p < 0 ? "text-red-600" : "text-zinc-700";
const pctSign = (p: number) => `${p > 0 ? "+" : ""}${Number(p).toFixed(0)}%`;

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
const price = (base: number, pct: number) =>
  Math.round(base * (1 + pct / 100) * 100) / 100; // 소수점 2자리 반올림

export default function RunnerView() {
  const [queue, setQueue] = useState<QueuedNews[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);

  // 뉴스 5개 구독
  useEffect(() => {
    const qRef = query(collection(db, "newsQueue"), orderBy("order", "asc"));
    const unsub = onSnapshot(qRef, (snap) => {
      const arr: QueuedNews[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setQueue(arr);
    });
    return () => unsub();
  }, []);

  // 종목 구독
  useEffect(() => {
    const q = query(collection(db, "stocks"), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const arr: Stock[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setStocks(arr.filter((s) => s.isPublished !== false));
    });
    return () => unsub();
  }, []);

  // 현재 시각 기준 노출될 뉴스 1개 선택
  const currentNews = useMemo(() => {
    const now = new Date();
    const candidates = queue
      .filter((q) => q.publishAt)
      .map((q) => ({ ...q, d: toDateSafe(q.publishAt)! }))
      .filter((q) => q.d && now >= q.d)
      .sort((a, b) => +a.d - +b.d);
    return candidates.at(-1) ?? null;
  }, [queue]);

  // 종목 표시용 가격/등락률 계산 (예약 반영 포함)
  const decoratedStocks = useMemo(() => {
    const now = new Date();
    return stocks.map((s) => {
      const applyAt = toDateSafe(s.applyAt);
      const shouldApply =
        s.scheduledDelta !== null &&
        s.scheduledDelta !== undefined &&
        applyAt !== null &&
        now >= applyAt;
      const effectiveDelta = shouldApply
        ? Number(s.scheduledDelta)
        : s.deltaPct;
      const currentPrice = price(Number(s.basePrice || 0), effectiveDelta);
      return { ...s, effectiveDelta, currentPrice };
    });
  }, [stocks]);

  return (
    <div className="min-h-screen newspaper-bg text-zinc-900">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="gothic-title text-5xl md:text-6xl text-center font-black drop-shadow-sm">
          The Timeless
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          {/* 왼쪽: 현재 노출 뉴스 */}
          <div className="card-nb p-6 md:p-8">
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">주목할 뉴스</span>
            </div>
            {currentNews ? (
              <>
                <h2 className="mt-3 text-2xl md:text-3xl font-bold leading-snug">
                  {currentNews.headline || "제목 없음"}
                </h2>
                <p className="mt-4 whitespace-pre-wrap leading-relaxed text-[15px] md:text-base">
                  {currentNews.body || ""}
                </p>
                <div className="mt-6 text-right text-xs text-zinc-500">
                  노출 시각:{" "}
                  {toDateSafe(currentNews.publishAt)?.toLocaleString?.() ?? "—"}
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-3 text-2xl md:text-3xl font-bold leading-snug">
                  (대기중)
                </h2>
                <p className="mt-4 text-[15px] md:text-base text-zinc-600">
                  예약된 노출 시간이 되면 뉴스가 표시됩니다.
                </p>
              </>
            )}
          </div>

          {/* 오른쪽: 종목 표 (가격 + 등락 표시) */}
          <div className="card-nb p-4 md:p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-wide">시장 동향</h3>
              <span className="text-xs text-zinc-500">예약/실시간 반영</span>
            </div>
            <div className="mt-4">
              <div className="grid grid-cols-[1fr_auto_auto] px-2 py-2 text-xs text-zinc-500 uppercase tracking-wider border-b">
                <div>주식사 / 설명</div>
                <div className="text-right pr-2">등락%</div>
                <div className="text-right">가격</div>
              </div>

              {decoratedStocks.length === 0 && (
                <div className="py-10 text-center text-zinc-500">
                  공개된 종목이 없습니다.
                </div>
              )}

              {decoratedStocks.map((s) => (
                <div
                  key={s.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-3 border-b last:border-b-0"
                >
                  <div>
                    {/* ✅ 회사명에 커스텀 툴팁 (업종 표시) */}
                    <div className="relative inline-block group">
                      <div className="font-bold text-xs">{s.name}</div>
                      {s.sector && s.sector.trim() !== "" && (
                        <div className="pointer-events-none absolute z-10 hidden group-hover:block left-0 top-full mt-1 whitespace-nowrap rounded-md bg-black/80 text-white text-[11px] px-2 py-1 shadow">
                          {s.sector}
                        </div>
                      )}
                    </div>

                    {/* 설명은 더 작게 */}
                    <div className="text-xs text-zinc-600">{s.description}</div>
                  </div>

                  <div
                    className={`text-right text-lg font-bold ${pctColor(
                      (s as any).effectiveDelta
                    )}`}
                  >
                    {pctSign((s as any).effectiveDelta)}
                  </div>
                  <div className="text-right font-semibold tabular-nums">
                    {Number.isFinite((s as any).currentPrice)
                      ? (s as any).currentPrice.toLocaleString()
                      : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
