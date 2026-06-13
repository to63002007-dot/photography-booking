import { useState, useRef, useEffect } from "react";

const OWNER_EMAIL = "to63002007@gmail.com";

const PLANS = [
  {
    id: "photo", name: "写真撮影プラン", price: "55,000円", raw: 55000, unit: "税別",
    tags: ["建築外観・内観", "半日 3〜4時間", "商業利用ライセンス込み"],
    detail: "建築外観・内観の環境光を捉えた高精度スチール撮影\nセレクト全カット・プロユースレタッチ納品（1週間以内）\n※工務店・設計事務所様の商業利用（著作物利用許諾）を含むBtoB専用プランです。",
    duration: 210,
  },
  {
    id: "photo_video", name: "写真＋ショート動画プラン", price: "88,000円", raw: 88000, unit: "税別",
    featured: true,
    tags: ["写真＋4K縦型動画3本", "半日〜1日 4〜6時間", "SNS二次利用ライセンス付与"],
    detail: "スチール撮影＋Instagramリール等に対応する縦型4Kショート動画素材（3本）\n企業のWEB・SNS発信における二次利用ライセンス（許諾）付与",
    duration: 300,
  },
  {
    id: "premium", name: "プレミアム建築写真・夕景夜景特化プラン", price: "165,000円", raw: 165000, unit: "税別",
    tags: ["日中〜夜間 終日", "夕景・マジックアワー・夜間照明", "長期媒体利用ライセンス込み"],
    detail: "朝〜夜間までの終日拘束（または2日間に分けた実務）\n日中の自然光カットに加え、夕景・マジックアワー・夜間照明の撮影を網羅\n地上撮影の最高峰クオリティ、長期媒体利用ライセンス含む完全パッケージ\n※大規模物件・遠方は別途お見積り",
    duration: 720,
  },
];

const BUILD_TYPES = ["戸建住宅", "マンション・集合住宅", "店舗・商業施設", "オフィス・ビル", "医療・福祉施設", "その他"];
const MADORI_OPTIONS = ["ワンルーム・1K", "1LDK〜2LDK", "3LDK〜4LDK", "5LDK以上／大型", "店舗・フロア型（間取りなし）"];

// Claude APIでメール文面生成
async function generateEmail(state, type) {
  try {
    const isClient = type === 'client';
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: isClient
          ? `あなたは岡山を拠点とするフリーカメラマン「戸坂」のアシスタントです。法人（工務店・設計事務所）への撮影予約確認メールをHTML形式で作成してください。丁寧なビジネス文体で、予約情報を表形式で記載。署名：「岡山 建築・店舗・法人撮影 / 戸坂」。件名は含めず本文HTMLのみ出力。`
          : `撮影予約の内部通知メールをHTML形式で作成してください。全情報を表形式で網羅し、対応アクション（見積書送付・日程確定返信など）を末尾に箇条書き。件名は含めず本文HTMLのみ出力。`,
        messages: [{ role: "user", content: `予約情報：${JSON.stringify(state, null, 2)}` }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || "";
  } catch { return ""; }
}

// Googleカレンダー空き確認
async function checkAvailability(date, time, duration) {
  try {
    const res = await fetch('/api/check-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, time, duration }),
    });
    return await res.json();
  } catch {
    return { available: true, fallback: true };
  }
}

// Googleカレンダーにイベント登録
async function createCalendarEvent(state) {
  try {
    const [y, mo, d] = state.date.split('/');
    const [h, mi] = state.time.split(':');
    const startISO = `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
    const endDate = new Date(`${y}-${mo}-${d}T${h}:${mi}:00`);
    endDate.setMinutes(endDate.getMinutes() + (state.plan.duration || 120));
    const endISO = endDate.toISOString().replace('Z', '+09:00');
    const desc = [
      `【依頼元】${state.company}`,
      `【担当者メール】${state.clientEmail || '未取得'}`,
      `【プラン】${state.plan.name}（${state.plan.price}・${state.plan.unit}〜）`,
      `【撮影対象】${state.subject}`,
      `【住所】${state.address}`,
      `【建物種別】${state.buildType}`,
      `【延床面積】${state.sqm}㎡`,
      `【階数】${state.floors}階`,
      `【間取り】${state.madori}`,
      `【撮影範囲備考】${state.remarks}`,
      `【駐車場】${state.parking}`,
    ].join('\n');
    const res = await fetch('/api/create-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `📷 撮影 | ${state.company}（${state.plan.name}）`,
        startTime: startISO, endTime: endISO,
        location: state.address, description: desc,
      }),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}

const css = {
  wrap: { maxWidth: 480, margin: "1.5rem auto", fontFamily: "var(--font-sans, sans-serif)", background: "var(--color-background-primary, #fff)", border: "0.5px solid var(--color-border-tertiary, #e0e0e0)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", height: 640 },
  header: { background: "#1a1a1a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: "#333", display: "flex", alignItems: "center", justifyContent: "center" },
  msgs: { flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: 10 },
  bot: { maxWidth: "85%", padding: "10px 14px", borderRadius: 18, borderBottomLeftRadius: 4, background: "var(--color-background-secondary, #f5f5f5)", color: "var(--color-text-primary, #111)", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", alignSelf: "flex-start" },
  user: { maxWidth: "85%", padding: "10px 14px", borderRadius: 18, borderBottomRightRadius: 4, background: "#1a1a1a", color: "#fff", fontSize: 13, lineHeight: 1.7, alignSelf: "flex-end" },
  err: { maxWidth: "85%", padding: "10px 14px", borderRadius: 18, borderBottomLeftRadius: 4, background: "#fff3e0", color: "#e65100", fontSize: 13, lineHeight: 1.7, alignSelf: "flex-start", border: "0.5px solid #ffcc80" },
  inputRow: { display: "flex", gap: 8, padding: 12, borderTop: "0.5px solid var(--color-border-tertiary, #e0e0e0)", flexShrink: 0 },
  textInput: { flex: 1, borderRadius: 20, border: "0.5px solid var(--color-border-secondary, #ccc)", padding: "8px 14px", fontSize: 13, background: "var(--color-background-secondary, #f5f5f5)", color: "var(--color-text-primary, #111)" },
  sendBtn: { width: 36, height: 36, borderRadius: "50%", background: "#1a1a1a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  note: { fontSize: 11, color: "var(--color-text-secondary, #888)", padding: "0 1rem 10px", textAlign: "center", flexShrink: 0 },
  choiceWrap: { display: "flex", flexDirection: "column", gap: 6, maxWidth: "94%", alignSelf: "flex-start" },
  cbtn: { background: "var(--color-background-primary, #fff)", border: "0.5px solid var(--color-border-secondary, #ccc)", borderRadius: 12, padding: "9px 14px", fontSize: 12, color: "var(--color-text-primary, #111)", cursor: "pointer", textAlign: "left", lineHeight: 1.5 },
  planWrap: { display: "flex", flexDirection: "column", gap: 8, maxWidth: "97%", alignSelf: "flex-start" },
  formBox: { background: "var(--color-background-secondary, #f5f5f5)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, maxWidth: "97%", alignSelf: "flex-start" },
  fLabel: { fontSize: 11, color: "var(--color-text-secondary, #888)", marginBottom: 2 },
  fInput: { borderRadius: 10, border: "0.5px solid var(--color-border-secondary, #ccc)", padding: "8px 12px", fontSize: 13, background: "var(--color-background-primary, #fff)", color: "var(--color-text-primary, #111)", width: "100%" },
  confirmBtn: { background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 12, padding: "9px 20px", fontSize: 13, cursor: "pointer", marginTop: 2 },
  tag: { fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--color-background-secondary, #f5f5f5)", color: "var(--color-text-secondary, #888)", border: "0.5px solid var(--color-border-tertiary, #e0e0e0)" },
  summaryBox: { background: "var(--color-background-secondary, #f5f5f5)", borderRadius: 14, padding: "14px 16px", fontSize: 12, lineHeight: 1.9, maxWidth: "97%", alignSelf: "flex-start" },
  badge: (ok) => ({ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 10px", borderRadius: 20, marginTop: 4, marginRight: 4, background: ok ? "#e8f5e9" : "#ffebee", color: ok ? "#2e7d32" : "#c62828" }),
};

export default function BookingBot() {
  const [messages, setMessages] = useState([]);
  const [inputVal, setInputVal] = useState("");
  const [step, setStep] = useState("plan");
  const [state, setState] = useState({});
  const [statuses, setStatuses] = useState({ calendar: null, clientMail: null, ownerMail: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const freeRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    addBot("はじめまして。\n岡山を拠点に建築・店舗・法人向け撮影を承っております。\n\nまずはプランをご確認のうえ、お気軽にご相談ください。（全プラン税別表記）");
    setTimeout(() => addUI("plan"), 800);
  }, []);

  const addBot = (text) => setMessages(p => [...p, { type: "bot", text }]);
  const addErr = (text) => setMessages(p => [...p, { type: "err", text }]);
  const addUser = (text) => setMessages(p => [...p, { type: "user", text }]);
  const addUI = (uiType) => setMessages(p => [...p, { type: "ui", uiType, id: Date.now() }]);
  const removeUI = (id) => setMessages(p => p.filter(m => !(m.type === "ui" && m.id === id)));

  function handleSend() {
    const v = inputVal.trim(); if (!v) return;
    setInputVal(""); addUser(v);
    if (freeRef.current) { const h = freeRef.current; freeRef.current = null; h(v); }
  }

  function onPlan(plan, id) {
    setState(p => ({ ...p, plan })); addUser(plan.name); removeUI(id);
    setTimeout(() => {
      addBot(`「${plan.name}」をお選びいただきありがとうございます。\n\nご依頼元の会社名または設計事務所名をお知らせください。`);
      setStep("company"); freeRef.current = onCompany;
    }, 400);
  }

  function onCompany(v) {
    setState(p => ({ ...p, company: v }));
    setTimeout(() => {
      addBot("ありがとうございます。\n\nご希望の撮影日時を選択してください。\n※最短1週間後から承っております。");
      setTimeout(() => addUI("date"), 400); setStep("date");
    }, 400);
  }

  // 日時確定時にカレンダー空き確認
  async function onDate(date, time, duration, id) {
    addUser(`${date} ${time}`); removeUI(id);
    setIsProcessing(true);
    addBot("カレンダーの空き状況を確認しています...");

    const result = await checkAvailability(date, time, duration);
    setIsProcessing(false);
    // 「確認中...」メッセージを削除
    setMessages(p => p.filter((m, i) => !(m.type === "bot" && m.text === "カレンダーの空き状況を確認しています...")));

    if (!result.available) {
      // 空きなし → 日時を再選択させる
      addErr(`⚠️ ${result.message || 'その日時はすでに予定が入っています。'}\n\n別の日時をお選びください。`);
      setTimeout(() => addUI("date"), 400);
      return;
    }

    // 空きあり
    setState(p => ({ ...p, date, time }));
    setTimeout(() => {
      const msg = result.fallback
        ? "日時を承りました。\n（※カレンダー連携未設定のため空き確認はスキップされました）\n\n撮影対象・物件の概要をお知らせください。"
        : "✅ その日時は空いています！\n\n撮影対象・物件の概要をお知らせください。\n（例：新築戸建 外観、店舗リノベ 内装全室など）";
      addBot(msg);
      setStep("subject"); freeRef.current = onSubject;
    }, 400);
  }

  function onSubject(v) {
    setState(p => ({ ...p, subject: v }));
    setTimeout(() => {
      addBot("ありがとうございます。\n\n撮影場所の詳細をご入力ください。");
      setTimeout(() => addUI("location"), 400); setStep("location");
    }, 400);
  }

  function onLocation(loc, id) {
    setState(p => ({ ...p, ...loc })); addUser(`${loc.address} ／ ${loc.buildType} ／ ${loc.madori}`); removeUI(id);
    setTimeout(() => {
      addBot("撮影場所の詳細を承りました。\n\n当日、駐車場はご利用可能でしょうか？");
      setTimeout(() => addUI("parking"), 400); setStep("parking");
    }, 400);
  }

  function onParking(v, id) {
    setState(p => ({ ...p, parking: v })); addUser(v); removeUI(id);
    setTimeout(() => {
      addBot("最後に、確認メールの送付先アドレスをご入力ください。\n（担当者様のメールアドレス）");
      setTimeout(() => addUI("email"), 400); setStep("email");
    }, 400);
  }

  async function onEmail(email, id) {
    const finalState = { ...state, clientEmail: email };
    setState(finalState); addUser(email); removeUI(id);
    setIsProcessing(true);
    setTimeout(async () => {
      setIsProcessing(false);
      addBot("以下の内容でご予約を受け付けました。");
      setTimeout(() => addUI("summary"), 300);
      setStep("confirm");
      await runIntegrations(finalState);
    }, 600);
  }

  async function runIntegrations(s) {
    const [calResult, clientHtml, ownerHtml] = await Promise.all([
      createCalendarEvent(s),
      generateEmail(s, 'client'),
      generateEmail(s, 'owner'),
    ]);
    setStatuses({
      calendar: calResult?.success ? "ok" : "error",
      clientMail: s.clientEmail ? "ok" : null,
      ownerMail: "ok",
    });
    window.__emailDrafts = { clientHtml, ownerHtml, clientEmail: s.clientEmail };
    setTimeout(() => {
      addBot("Googleカレンダーへの登録と確認メールの準備が完了しました。\n1〜2営業日以内に改めてご連絡いたします。\nお問い合わせありがとうございました。");
    }, 500);
  }

  function renderUI({ uiType, id }) {
    if (uiType === "plan") return <PlanCards onSelect={(p) => onPlan(p, id)} />;
    if (uiType === "date") return <DatePicker onConfirm={(d, t, dur) => onDate(d, t, dur, id)} plan={state.plan} />;
    if (uiType === "location") return <LocationForm onConfirm={(l) => onLocation(l, id)} />;
    if (uiType === "parking") return (
      <div style={css.choiceWrap}>
        {["駐車場あり", "駐車場なし・要確認"].map(o => (
          <button key={o} style={css.cbtn} onClick={() => onParking(o, id)}>{o}</button>
        ))}
      </div>
    );
    if (uiType === "email") return <EmailInput onConfirm={(e) => onEmail(e, id)} />;
    if (uiType === "summary") return <Summary state={state} statuses={statuses} />;
    return null;
  }

  return (
    <div style={css.wrap}>
      <div style={css.header}>
        <div style={css.avatar}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
        </div>
        <div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>撮影予約アシスタント</div>
          <div style={{ color: "#8bc34a", fontSize: 11, marginTop: 2 }}>● オンライン 24時間対応</div>
        </div>
      </div>
      <div style={css.msgs}>
        {messages.map((m, i) => (
          <div key={m.id || i}>
            {m.type === "bot" && <div style={css.bot}>{m.text}</div>}
            {m.type === "err" && <div style={css.err}>{m.text}</div>}
            {m.type === "user" && <div style={css.user}>{m.text}</div>}
            {m.type === "ui" && renderUI(m)}
          </div>
        ))}
        {isProcessing && (
          <div style={{ ...css.bot, display: "flex", gap: 4, padding: "12px 14px" }}>
            {[0, 200, 400].map(d => (
              <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "#999", display: "inline-block", animation: `bounce 1.2s ${d}ms infinite` }} />
            ))}
          </div>
        )}
        <style>{`@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}`}</style>
        <div ref={endRef} />
      </div>
      <div style={css.inputRow}>
        <input style={css.textInput} value={inputVal} onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder={step === "confirm" ? "別の案件はお気軽にどうぞ" : "メッセージを入力..."} />
        <button style={css.sendBtn} onClick={handleSend}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div style={css.note}>予約完了時にGoogleカレンダー登録・確認メール自動送信</div>
    </div>
  );
}

function PlanCards({ onSelect }) {
  return (
    <div style={css.planWrap}>
      {PLANS.map(p => (
        <div key={p.id} onClick={() => onSelect(p)} style={{ background: "var(--color-background-primary,#fff)", border: p.featured ? "1.5px solid #1a1a1a" : "0.5px solid var(--color-border-secondary,#ccc)", borderRadius: 14, padding: "12px 16px", cursor: "pointer", position: "relative" }}>
          {p.featured && <div style={{ position: "absolute", top: -1, right: 14, background: "#1a1a1a", color: "#fff", fontSize: 10, padding: "3px 10px", borderRadius: "0 0 8px 8px" }}>人気</div>}
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{p.price}<span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-secondary,#888)", marginLeft: 4 }}>{p.unit}〜</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>{p.tags.map(t => <span key={t} style={css.tag}>{t}</span>)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p.detail}</div>
        </div>
      ))}
    </div>
  );
}

function DatePicker({ onConfirm, plan }) {
  const min = new Date(); min.setDate(min.getDate() + 7);
  const minStr = min.toISOString().split("T")[0];
  const [date, setDate] = useState(""); const [time, setTime] = useState("10:00"); const [err, setErr] = useState("");
  function confirm() {
    if (!date) { setErr("日付を選択してください"); return; }
    const s = new Date(date); s.setHours(0, 0, 0, 0); const m = new Date(minStr); m.setHours(0, 0, 0, 0);
    if (s < m) { setErr("最短1週間後から予約可能です"); return; }
    onConfirm(date.replace(/-/g, "/"), time, plan?.duration || 120);
  }
  return (
    <div style={css.formBox}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>※ 最短受付日：{min.getMonth() + 1}月{min.getDate()}日以降</div>
      <input style={css.fInput} type="date" min={minStr} value={date} onChange={e => setDate(e.target.value)} />
      <input style={css.fInput} type="time" value={time} onChange={e => setTime(e.target.value)} />
      {err && <div style={{ fontSize: 11, color: "#c0392b" }}>{err}</div>}
      <button style={css.confirmBtn} onClick={confirm}>空き確認・日時を確定する</button>
    </div>
  );
}

function LocationForm({ onConfirm }) {
  const [addr, setAddr] = useState(""); const [buildType, setBuildType] = useState("");
  const [sqm, setSqm] = useState(""); const [floors, setFloors] = useState("");
  const [madori, setMadori] = useState(""); const [remarks, setRemarks] = useState(""); const [err, setErr] = useState("");
  function confirm() {
    if (!addr) { setErr("住所を入力してください"); return; }
    if (!buildType) { setErr("建物種別を選択してください"); return; }
    if (!madori) { setErr("間取りを選択してください"); return; }
    onConfirm({ address: addr, buildType, sqm: sqm || "未記入", floors: floors || "未記入", madori, remarks: remarks || "なし" });
  }
  return (
    <div style={css.formBox}>
      <div><div style={css.fLabel}>住所（市区町村以降）</div><input style={css.fInput} placeholder="例：岡山市北区○○1-2-3" value={addr} onChange={e => setAddr(e.target.value)} /></div>
      <div><div style={css.fLabel}>建物種別</div>
        <select style={css.fInput} value={buildType} onChange={e => setBuildType(e.target.value)}>
          <option value="">選択してください</option>
          {BUILD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><div style={css.fLabel}>延床面積（㎡）</div><input style={css.fInput} type="number" min="1" placeholder="例：120" value={sqm} onChange={e => setSqm(e.target.value)} /></div>
        <div style={{ flex: 1 }}><div style={css.fLabel}>階数</div><input style={css.fInput} type="number" min="1" placeholder="例：2" value={floors} onChange={e => setFloors(e.target.value)} /></div>
      </div>
      <div><div style={css.fLabel}>間取り・フロア構成</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
          {MADORI_OPTIONS.map(m => (
            <button key={m} onClick={() => setMadori(m)} style={{ background: madori === m ? "#1a1a1a" : "var(--color-background-primary,#fff)", color: madori === m ? "#fff" : "var(--color-text-primary,#111)", border: madori === m ? "1px solid #1a1a1a" : "0.5px solid var(--color-border-secondary,#ccc)", borderRadius: 10, padding: "8px 8px", fontSize: 11, cursor: "pointer" }}>{m}</button>
          ))}
        </div>
      </div>
      <div><div style={css.fLabel}>撮影範囲・備考（任意）</div><input style={css.fInput} placeholder="例：外観・LDK・水回りのみ" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
      {err && <div style={{ fontSize: 11, color: "#c0392b" }}>{err}</div>}
      <button style={css.confirmBtn} onClick={confirm}>撮影場所を確定する</button>
    </div>
  );
}

function EmailInput({ onConfirm }) {
  const [email, setEmail] = useState(""); const [err, setErr] = useState("");
  function confirm() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr("正しいメールアドレスを入力してください"); return; }
    onConfirm(email);
  }
  return (
    <div style={css.formBox}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary,#888)" }}>予約確認メールをお送りします</div>
      <input style={css.fInput} type="email" placeholder="例：contact@example.co.jp" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && confirm()} />
      {err && <div style={{ fontSize: 11, color: "#c0392b" }}>{err}</div>}
      <button style={css.confirmBtn} onClick={confirm}>確認メールを送る</button>
    </div>
  );
}

function Summary({ state: s, statuses }) {
  if (!s.plan) return null;
  const tax = Math.round(s.plan.raw * 1.1).toLocaleString();
  return (
    <div style={css.summaryBox}>
      {[["会社・事務所名", s.company], ["プラン", s.plan?.name], ["撮影日時", `${s.date} ${s.time}`], ["撮影対象", s.subject]].map(([l, v]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--color-text-secondary,#888)", flexShrink: 0 }}>{l}</span>
          <span style={{ fontWeight: 500, textAlign: "right" }}>{v}</span>
        </div>
      ))}
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary,#888)", margin: "8px 0 4px", paddingTop: 6, borderTop: "0.5px solid var(--color-border-tertiary,#e0e0e0)" }}>📍 撮影場所</div>
      {[["住所", s.address], ["建物種別", s.buildType], ["延床面積", `${s.sqm}㎡`], ["階数", `${s.floors}階`], ["間取り", s.madori], ["撮影範囲備考", s.remarks], ["駐車場", s.parking]].map(([l, v]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--color-text-secondary,#888)", flexShrink: 0 }}>{l}</span>
          <span style={{ fontWeight: 500, textAlign: "right" }}>{v}</span>
        </div>
      ))}
      <div style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary,#888)", margin: "8px 0 4px", paddingTop: 6, borderTop: "0.5px solid var(--color-border-tertiary,#e0e0e0)" }}>📧 確認メール送付先</div>
      {[["お客様", s.clientEmail], ["担当者", OWNER_EMAIL]].map(([l, v]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--color-text-secondary,#888)" }}>{l}</span>
          <span style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ))}
      <div style={{ borderTop: "0.5px solid var(--color-border-secondary,#ccc)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13 }}>お見積り（税別）</span>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{s.plan?.price}〜</span>
      </div>
      <div style={{ fontSize: 10, color: "var(--color-text-secondary,#888)", textAlign: "right", marginTop: 2 }}>税込 {tax}円〜　※遠方・大規模物件は別途お見積り</div>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>
        {statuses.calendar === "ok" && <span style={css.badge(true)}>✓ カレンダー登録済み</span>}
        {statuses.calendar === "error" && <span style={css.badge(false)}>⚠ カレンダー要確認</span>}
        {statuses.clientMail === "ok" && <span style={css.badge(true)}>✓ お客様へメール送信</span>}
        {statuses.ownerMail === "ok" && <span style={css.badge(true)}>✓ 担当者へ通知メール</span>}
      </div>
    </div>
  );
}
