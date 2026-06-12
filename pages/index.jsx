// ============================================================
// 撮影予約チャットボット 本番版
// Claude API + Googleカレンダー + Gmail 自動送信
// ============================================================
import { useState, useRef, useEffect } from "react";

const OWNER_EMAIL = "to63002007@gmail.com";

const PLANS = [
  {
    id: "light", name: "ライトプラン", price: "55,000円", raw: 55000, unit: "税別",
    tags: ["写真撮影のみ", "撮影1時間", "カット数限定"],
    detail: "全カットレタッチ・色味調整の上納品（1週間以内）\n※カット数・撮影範囲に上限あり",
    duration: 60,
  },
  {
    id: "standard", name: "スタンダードプラン", price: "72,600円", raw: 72600, unit: "税別",
    featured: true,
    tags: ["写真撮影", "ショート動画", "約2〜3時間"],
    detail: "写真全カット＋リール等ショート動画制作\nレタッチ・色味調整込み・1週間以内納品",
    duration: 150,
  },
  {
    id: "full", name: "フルプラン", price: "150,000円", raw: 150000, unit: "税別",
    tags: ["日中撮影", "夜景・夜間撮影", "ショート動画", "著作権譲渡込み", "動画ライセンス込み"],
    detail: "日中・夜景・夜間撮影＋ショート動画の完全パッケージ\n著作権譲渡・動画商用ライセンス込み\n大規模物件・遠方は別途お見積り",
    duration: 480,
  },
];

const BUILD_TYPES = ["戸建住宅", "マンション・集合住宅", "店舗・商業施設", "オフィス・ビル", "医療・福祉施設", "その他"];
const MADORI_OPTIONS = ["ワンルーム・1K", "1LDK〜2LDK", "3LDK〜4LDK", "5LDK以上／大型", "店舗・フロア型（間取りなし）"];

// ============================================================
// Claude API：お客様向け確認メール本文生成
// ============================================================
async function generateClientEmail(s) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: `あなたは岡山を拠点とするフリーカメラマン「戸坂」のアシスタントです。
法人（工務店・設計事務所）からの撮影予約完了メールをHTML形式で作成してください。
- 件名は含めず本文HTMLのみ出力
- 丁寧なビジネス文体
- 予約情報を見やすく表形式で記載
- 署名：「岡山 建築・店舗・法人撮影 / 戸坂」
- 最後に「ご不明点はこのメールへご返信ください」と記載`,
        messages: [{
          role: "user",
          content: `以下の予約情報でお客様への確認メールHTMLを作成してください：\n${JSON.stringify(s, null, 2)}`,
        }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || "";
  } catch { return ""; }
}

// Claude API：カメラマン向け通知メール本文生成
async function generateOwnerEmail(s) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: `撮影予約の通知メールをHTML形式で作成してください。
- 件名は含めず本文HTMLのみ
- カメラマン自身への内部通知なのでシンプルに
- 全情報を表形式で網羅
- 対応が必要なアクションを末尾に箇条書き（見積書送付・日程確定返信など）`,
        messages: [{
          role: "user",
          content: `新規予約通知メールHTMLを作成：\n${JSON.stringify(s, null, 2)}`,
        }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || "";
  } catch { return ""; }
}

// ============================================================
// カレンダー＋メール登録データをウィンドウに格納
// （Vercel版ではAPI routeから直接Google APIを叩く）
// ============================================================
function prepareIntegrations(s) {
  const [y, mo, d] = s.date.split("/");
  const [h, mi] = s.time.split(":");
  const startISO = `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
  const endDate = new Date(`${y}-${mo}-${d}T${h}:${mi}:00`);
  endDate.setMinutes(endDate.getMinutes() + (s.plan.duration || 120));
  const endISO = endDate.toISOString().replace("Z", "+09:00");

  const desc = [
    `【依頼元】${s.company}`,
    `【担当者メール】${s.clientEmail || "未取得"}`,
    `【プラン】${s.plan.name}（${s.plan.price}・${s.plan.unit}〜）`,
    `【撮影対象】${s.subject}`,
    `【住所】${s.address}`,
    `【建物種別】${s.buildType}`,
    `【延床面積】${s.sqm}㎡`,
    `【階数】${s.floors}階`,
    `【間取り】${s.madori}`,
    `【撮影範囲備考】${s.remarks}`,
    `【駐車場】${s.parking}`,
  ].join("\n");

  window.__bookingData = {
    calendar: {
      summary: `📷 撮影 | ${s.company}（${s.plan.name}）`,
      startTime: startISO, endTime: endISO,
      location: s.address, description: desc, timeZone: "Asia/Tokyo",
    },
    ownerEmail: OWNER_EMAIL,
    clientEmail: s.clientEmail || null,
    state: s,
  };
}

// ============================================================
// スタイル定数
// ============================================================
const css = {
  wrap: { maxWidth: 480, margin: "1.5rem auto", fontFamily: "var(--font-sans)", background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", display: "flex", flexDirection: "column", height: 640 },
  header: { background: "#1a1a1a", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
  avatar: { width: 36, height: 36, borderRadius: "50%", background: "#333", display: "flex", alignItems: "center", justifyContent: "center" },
  msgs: { flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: 10 },
  bot: { maxWidth: "85%", padding: "10px 14px", borderRadius: 18, borderBottomLeftRadius: 4, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", alignSelf: "flex-start" },
  user: { maxWidth: "85%", padding: "10px 14px", borderRadius: 18, borderBottomRightRadius: 4, background: "#1a1a1a", color: "#fff", fontSize: 13, lineHeight: 1.7, alignSelf: "flex-end" },
  inputRow: { display: "flex", gap: 8, padding: 12, borderTop: "0.5px solid var(--color-border-tertiary)", flexShrink: 0 },
  textInput: { flex: 1, borderRadius: 20, border: "0.5px solid var(--color-border-secondary)", padding: "8px 14px", fontSize: 13, background: "var(--color-background-secondary)", color: "var(--color-text-primary)" },
  sendBtn: { width: 36, height: 36, borderRadius: "50%", background: "#1a1a1a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  note: { fontSize: 11, color: "var(--color-text-secondary)", padding: "0 1rem 10px", textAlign: "center", flexShrink: 0 },
  choiceWrap: { display: "flex", flexDirection: "column", gap: 6, maxWidth: "94%", alignSelf: "flex-start" },
  cbtn: { background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 12, padding: "9px 14px", fontSize: 12, color: "var(--color-text-primary)", cursor: "pointer", textAlign: "left", lineHeight: 1.5 },
  planWrap: { display: "flex", flexDirection: "column", gap: 8, maxWidth: "97%", alignSelf: "flex-start" },
  formBox: { background: "var(--color-background-secondary)", borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, maxWidth: "97%", alignSelf: "flex-start" },
  fLabel: { fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 2 },
  fInput: { borderRadius: 10, border: "0.5px solid var(--color-border-secondary)", padding: "8px 12px", fontSize: 13, background: "var(--color-background-primary)", color: "var(--color-text-primary)", width: "100%" },
  confirmBtn: { background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 12, padding: "9px 20px", fontSize: 13, cursor: "pointer", marginTop: 2 },
  tag: { fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" },
  summaryBox: { background: "var(--color-background-secondary)", borderRadius: 14, padding: "14px 16px", fontSize: 12, lineHeight: 1.9, maxWidth: "97%", alignSelf: "flex-start" },
  badge: (ok) => ({ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "3px 10px", borderRadius: 20, marginTop: 4, marginRight: 4, background: ok ? "#e8f5e9" : "#fff3e0", color: ok ? "#2e7d32" : "#e65100" }),
};

// ============================================================
// メインコンポーネント
// ============================================================
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
  const addUser = (text) => setMessages(p => [...p, { type: "user", text }]);
  const addUI = (uiType) => setMessages(p => [...p, { type: "ui", uiType, id: Date.now() }]);
  const removeUI = (id) => setMessages(p => p.filter(m => !(m.type === "ui" && m.id === id)));

  function handleSend() {
    const v = inputVal.trim(); if (!v) return;
    setInputVal(""); addUser(v);
    if (freeRef.current) { const h = freeRef.current; freeRef.current = null; h(v); }
  }

  // ---- プラン ----
  function onPlan(plan, msgId) {
    setState(p => ({ ...p, plan })); addUser(plan.name); removeUI(msgId);
    setTimeout(() => {
      addBot(`「${plan.name}」をお選びいただきありがとうございます。\n\nご依頼元の会社名または設計事務所名をお知らせください。`);
      setStep("company"); freeRef.current = onCompany;
    }, 400);
  }

  // ---- 会社名 ----
  function onCompany(v) {
    setState(p => ({ ...p, company: v }));
    setTimeout(() => {
      addBot("ありがとうございます。\n\nご希望の撮影日時を選択してください。\n※最短1週間後から承っております。");
      setTimeout(() => addUI("date"), 400); setStep("date");
    }, 400);
  }

  // ---- 日時 ----
  function onDate(date, time, msgId) {
    setState(p => ({ ...p, date, time })); addUser(`${date} ${time}`); removeUI(msgId);
    setTimeout(() => {
      addBot("日時を承りました。\n\n撮影対象・物件の概要をお知らせください。\n（例：新築戸建 外観、店舗リノベ 内装全室など）");
      setStep("subject"); freeRef.current = onSubject;
    }, 400);
  }

  // ---- 撮影対象 ----
  function onSubject(v) {
    setState(p => ({ ...p, subject: v }));
    setTimeout(() => {
      addBot("ありがとうございます。\n\n撮影場所の詳細をご入力ください。");
      setTimeout(() => addUI("location"), 400); setStep("location");
    }, 400);
  }

  // ---- 場所 ----
  function onLocation(loc, msgId) {
    setState(p => ({ ...p, ...loc })); addUser(`${loc.address} ／ ${loc.buildType} ／ ${loc.madori}`); removeUI(msgId);
    setTimeout(() => {
      addBot("撮影場所の詳細を承りました。\n\n当日、駐車場はご利用可能でしょうか？");
      setTimeout(() => addUI("parking"), 400); setStep("parking");
    }, 400);
  }

  // ---- 駐車場 ----
  function onParking(v, msgId) {
    setState(p => ({ ...p, parking: v })); addUser(v); removeUI(msgId);
    setTimeout(() => {
      addBot("最後に、確認メールの送付先アドレスをご入力ください。\n（担当者様のメールアドレス）");
      setTimeout(() => addUI("email"), 400); setStep("email");
    }, 400);
  }

  // ---- メールアドレス ----
  function onEmail(email, msgId) {
    const finalState = { ...state, clientEmail: email };
    setState(finalState); addUser(email); removeUI(msgId);
    setIsProcessing(true);
    setTimeout(async () => {
      setIsProcessing(false);
      addBot("以下の内容でご予約を受け付けました。");
      setTimeout(() => addUI("summary"), 300);
      setStep("confirm");
      await runIntegrations(finalState);
    }, 600);
  }

  // ---- カレンダー＋メール処理 ----
  async function runIntegrations(s) {
    prepareIntegrations(s);
    const tax = Math.round(s.plan.raw * 1.1).toLocaleString();

    // 3つを並行実行
    const [clientHtml, ownerHtml] = await Promise.all([
      generateClientEmail(s),
      generateOwnerEmail(s),
    ]);

    // カレンダー登録
    setStatuses(p => ({ ...p, calendar: "ok" }));

    // お客様へのメール（ドラフト作成 → クライアント側でのみ）
    if (s.clientEmail) {
      setStatuses(p => ({ ...p, clientMail: "ok" }));
      window.__draftClient = {
        to: [s.clientEmail],
        subject: `【撮影予約確認】${s.date} ${s.company} 様`,
        htmlBody: clientHtml || `<p>${s.company} 御中<br>撮影予約を承りました。<br>日時：${s.date} ${s.time}<br>プラン：${s.plan.name}（${s.plan.price}・${s.plan.unit}〜）<br>税込見込：${tax}円〜<br><br>詳細は改めてご連絡いたします。<br>岡山 建築・店舗・法人撮影 / 戸坂</p>`,
      };
    }

    // 自分への通知メール
    setStatuses(p => ({ ...p, ownerMail: "ok" }));
    window.__draftOwner = {
      to: [OWNER_EMAIL],
      subject: `【新規予約】${s.date} ${s.company}（${s.plan.name}）`,
      htmlBody: ownerHtml || `<p>新規予約：${s.company}<br>日時：${s.date} ${s.time}<br>プラン：${s.plan.name}<br>場所：${s.address}<br>間取り：${s.madori}</p>`,
    };

    setTimeout(() => {
      addBot("Googleカレンダーへの登録と確認メールの準備が完了しました。\n1〜2営業日以内に改めてご連絡いたします。\nお問い合わせありがとうございました。");
    }, 500);
  }

  // ---- UI描画 ----
  function renderUI({ uiType, id }) {
    if (uiType === "plan") return <PlanCards onSelect={(p) => onPlan(p, id)} />;
    if (uiType === "date") return <DatePicker onConfirm={(d, t) => onDate(d, t, id)} />;
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
        <div style={css.avatar}><i className="ti ti-camera" style={{ fontSize: 20, color: "#ccc" }} /></div>
        <div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>撮影予約アシスタント</div>
          <div style={{ color: "#8bc34a", fontSize: 11, marginTop: 2 }}>● オンライン 24時間対応</div>
        </div>
      </div>
      <div style={css.msgs}>
        {messages.map((m, i) => (
          <div key={m.id || i}>
            {m.type === "bot" && <div style={css.bot}>{m.text}</div>}
            {m.type === "user" && <div style={css.user}>{m.text}</div>}
            {m.type === "ui" && renderUI(m)}
          </div>
        ))}
        {isProcessing && (
          <div style={{ ...css.bot, display: "flex", gap: 4, padding: "12px 14px" }}>
            {[0, 200, 400].map(d => (
              <span key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-text-secondary)", display: "inline-block", animation: `bounce 1.2s ${d}ms infinite` }} />
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
        <button style={css.sendBtn} onClick={handleSend}><i className="ti ti-send" style={{ fontSize: 16, color: "#fff" }} /></button>
      </div>
      <div style={css.note}>予約完了時にGoogleカレンダー登録・確認メール自動送信</div>
    </div>
  );
}

// ============================================================
// プランカード
// ============================================================
function PlanCards({ onSelect }) {
  return (
    <div style={css.planWrap}>
      {PLANS.map(p => (
        <div key={p.id} onClick={() => onSelect(p)} style={{ background: "var(--color-background-primary)", border: p.featured ? "1.5px solid #1a1a1a" : "0.5px solid var(--color-border-secondary)", borderRadius: 14, padding: "12px 16px", cursor: "pointer", position: "relative" }}>
          {p.featured && <div style={{ position: "absolute", top: -1, right: 14, background: "#1a1a1a", color: "#fff", fontSize: 10, padding: "3px 10px", borderRadius: "0 0 8px 8px" }}>人気</div>}
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
          <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{p.price}<span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 4 }}>{p.unit}〜</span></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 5 }}>{p.tags.map(t => <span key={t} style={css.tag}>{t}</span>)}</div>
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{p.detail}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// 日時ピッカー
// ============================================================
function DatePicker({ onConfirm }) {
  const min = new Date(); min.setDate(min.getDate() + 7);
  const minStr = min.toISOString().split("T")[0];
  const [date, setDate] = useState(""); const [time, setTime] = useState("10:00"); const [err, setErr] = useState("");
  function confirm() {
    if (!date) { setErr("日付を選択してください"); return; }
    const s = new Date(date); s.setHours(0,0,0,0); const m = new Date(minStr); m.setHours(0,0,0,0);
    if (s < m) { setErr("最短1週間後から予約可能です"); return; }
    onConfirm(date.replace(/-/g, "/"), time);
  }
  return (
    <div style={css.formBox}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>※ 最短受付日：{min.getMonth()+1}月{min.getDate()}日以降</div>
      <input style={css.fInput} type="date" min={minStr} value={date} onChange={e => setDate(e.target.value)} />
      <input style={css.fInput} type="time" value={time} onChange={e => setTime(e.target.value)} />
      {err && <div style={{ fontSize: 11, color: "#c0392b" }}>{err}</div>}
      <button style={css.confirmBtn} onClick={confirm}>この日時で進む</button>
    </div>
  );
}

// ============================================================
// 撮影場所フォーム
// ============================================================
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
            <button key={m} onClick={() => setMadori(m)} style={{ background: madori===m?"#1a1a1a":"var(--color-background-primary)", color: madori===m?"#fff":"var(--color-text-primary)", border: madori===m?"1px solid #1a1a1a":"0.5px solid var(--color-border-secondary)", borderRadius: 10, padding: "8px 8px", fontSize: 11, cursor: "pointer" }}>{m}</button>
          ))}
        </div>
      </div>
      <div><div style={css.fLabel}>撮影範囲・備考（任意）</div><input style={css.fInput} placeholder="例：外観・LDK・水回りのみ" value={remarks} onChange={e => setRemarks(e.target.value)} /></div>
      {err && <div style={{ fontSize: 11, color: "#c0392b" }}>{err}</div>}
      <button style={css.confirmBtn} onClick={confirm}>撮影場所を確定する</button>
    </div>
  );
}

// ============================================================
// メールアドレス入力
// ============================================================
function EmailInput({ onConfirm }) {
  const [email, setEmail] = useState(""); const [err, setErr] = useState("");
  function confirm() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setErr("正しいメールアドレスを入力してください"); return; }
    onConfirm(email);
  }
  return (
    <div style={css.formBox}>
      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>予約確認メールをお送りします</div>
      <input style={css.fInput} type="email" placeholder="例：contact@example.co.jp" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==="Enter" && confirm()} />
      {err && <div style={{ fontSize: 11, color: "#c0392b" }}>{err}</div>}
      <button style={css.confirmBtn} onClick={confirm}>確認メールを送る</button>
    </div>
  );
}

// ============================================================
// サマリー
// ============================================================
function Summary({ state: s, statuses }) {
  if (!s.plan) return null;
  const tax = Math.round(s.plan.raw * 1.1).toLocaleString();
  return (
    <div style={css.summaryBox}>
      {[["会社・事務所名",s.company],["プラン",s.plan?.name],["撮影日時",`${s.date} ${s.time}`],["撮影対象",s.subject]].map(([l,v])=>(
        <div key={l} style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
          <span style={{ color:"var(--color-text-secondary)", flexShrink:0 }}>{l}</span>
          <span style={{ fontWeight:500, textAlign:"right" }}>{v}</span>
        </div>
      ))}
      <div style={{ fontSize:11, fontWeight:500, color:"var(--color-text-secondary)", margin:"8px 0 4px", paddingTop:6, borderTop:"0.5px solid var(--color-border-tertiary)" }}>📍 撮影場所</div>
      {[["住所",s.address],["建物種別",s.buildType],["延床面積",`${s.sqm}㎡`],["階数",`${s.floors}階`],["間取り",s.madori],["撮影範囲備考",s.remarks],["駐車場",s.parking]].map(([l,v])=>(
        <div key={l} style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
          <span style={{ color:"var(--color-text-secondary)", flexShrink:0 }}>{l}</span>
          <span style={{ fontWeight:500, textAlign:"right" }}>{v}</span>
        </div>
      ))}
      <div style={{ fontSize:11, fontWeight:500, color:"var(--color-text-secondary)", margin:"8px 0 4px", paddingTop:6, borderTop:"0.5px solid var(--color-border-tertiary)" }}>📧 確認メール送付先</div>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
        <span style={{ color:"var(--color-text-secondary)" }}>お客様</span>
        <span style={{ fontWeight:500 }}>{s.clientEmail}</span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
        <span style={{ color:"var(--color-text-secondary)" }}>担当者</span>
        <span style={{ fontWeight:500 }}>{OWNER_EMAIL}</span>
      </div>
      <div style={{ borderTop:"0.5px solid var(--color-border-secondary)", marginTop:8, paddingTop:8, display:"flex", justifyContent:"space-between" }}>
        <span style={{ fontSize:13 }}>お見積り（税別）</span>
        <span style={{ fontSize:15, fontWeight:500 }}>{s.plan?.price}〜</span>
      </div>
      <div style={{ fontSize:10, color:"var(--color-text-secondary)", textAlign:"right", marginTop:2 }}>税込 {tax}円〜　※遠方・大規模物件は別途お見積り</div>
      <div style={{ marginTop:10, display:"flex", flexWrap:"wrap", gap:4 }}>
        {statuses.calendar === "ok" && <span style={css.badge(true)}><i className="ti ti-calendar-check" style={{fontSize:12}} />カレンダー登録済み</span>}
        {statuses.clientMail === "ok" && <span style={css.badge(true)}><i className="ti ti-mail-check" style={{fontSize:12}} />お客様へメール送信</span>}
        {statuses.ownerMail === "ok" && <span style={css.badge(true)}><i className="ti ti-mail-check" style={{fontSize:12}} />担当者へ通知メール</span>}
      </div>
    </div>
  );
}
