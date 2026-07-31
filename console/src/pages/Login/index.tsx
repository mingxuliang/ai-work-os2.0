import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAppMessage } from "../../hooks/useAppMessage";
import { authApi } from "../../api/modules/auth";
import { setAuthToken } from "../../api/config";
import { syncAuthenticatedUserKeyFromToken } from "../../utils/authUsername";

// ── Particles ────────────────────────────────────────────────────────────
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  x: (i * 43 + 11) % 100,
  y: (i * 61 + 9) % 100,
  size: (i % 3) + 1,
  dur: 4 + (i % 6),
  delay: (i % 7) * -1.2,
}));

const HIGHLIGHTS = [
  { icon: "ri-robot-2-line",    title: "智能体协作",  desc: "多 Agent 协同，复杂任务自动拆解" },
  { icon: "ri-database-2-line", title: "AI 知识库",   desc: "企业知识沉淀，秒级检索问答" },
  { icon: "ri-tools-line",      title: "技能编排",    desc: "模块化 AI 技能，按需调用与组合" },
];

let _injected = false;
function injectAnims() {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes lwFloatUp   { 0%,100%{transform:translateY(0);opacity:.35} 50%{transform:translateY(-18px);opacity:.75} }
    @keyframes lwFloatDown { 0%,100%{transform:translateY(-8px);opacity:.25} 50%{transform:translateY(8px);opacity:.6} }
    @keyframes lwScanLine  { 0%{top:0;opacity:0} 6%{opacity:.4} 94%{opacity:.4} 100%{top:100%;opacity:0} }
    @keyframes lwGlow      { 0%,100%{opacity:.18;transform:scale(1)} 50%{opacity:.5;transform:scale(1.06)} }
    @keyframes lwCardIn    { from{opacity:0;transform:translateY(20px) scale(.98)} to{opacity:1;transform:none} }
    @keyframes lwHeroIn    { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:none} }
    @keyframes lwLogoIn    { from{opacity:0;transform:translateX(-14px)} to{opacity:1;transform:none} }
    @keyframes lwBadge     { 0%{transform:scale(1);opacity:.65} 70%,100%{transform:scale(2.2);opacity:0} }
    @keyframes lwShimmer   { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
    @keyframes lwHeroIcon  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.07)} }
    @keyframes lwSpin      { to{transform:rotate(360deg)} }
    @keyframes lwFeatIn    { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:none} }

    .lw-up      { animation: lwFloatUp   5s ease-in-out infinite; }
    .lw-down    { animation: lwFloatDown 4.5s ease-in-out infinite; }
    .lw-scan    { animation: lwScanLine  12s linear infinite; position:absolute; left:0; width:100%; pointer-events:none; }
    .lw-glow    { animation: lwGlow 3.5s ease-in-out infinite; position:absolute; border-radius:50%; pointer-events:none; }
    .lw-card-in { animation: lwCardIn .65s cubic-bezier(.22,1,.36,1) .1s both; }
    .lw-hero-in { animation: lwHeroIn .7s cubic-bezier(.22,1,.36,1) .05s both; }
    .lw-logo-in { animation: lwLogoIn .5s cubic-bezier(.22,1,.36,1) both; }
    .lw-hero    { animation: lwHeroIcon 2.6s ease-in-out infinite; }
    .lw-spin    { animation: lwSpin .8s linear infinite; display:inline-block; }
    .lw-badge-dot::after { content:''; position:absolute; inset:0; border-radius:50%; background:rgba(96,165,250,.4); animation:lwBadge 2s ease-out infinite; }
    .lw-btn::after { content:''; position:absolute; inset:0; width:35%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent); animation:lwShimmer 2.6s ease-in-out infinite; }
    .lw-input { outline:none; width:100%; box-sizing:border-box; }
    .lw-input::placeholder { color:rgba(147,197,253,.22); }
    .lw-feat-1 { animation: lwFeatIn .5s cubic-bezier(.22,1,.36,1) .25s both; }
    .lw-feat-2 { animation: lwFeatIn .5s cubic-bezier(.22,1,.36,1) .38s both; }
    .lw-feat-3 { animation: lwFeatIn .5s cubic-bezier(.22,1,.36,1) .51s both; }
    .lw-hl:hover { background:rgba(59,130,246,.1) !important; border-color:rgba(96,165,250,.28) !important; }
  `;
  document.head.appendChild(s);
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { message } = useAppMessage();

  const [mounted,    setMounted]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [account,    setAccount]    = useState("");
  const [password,   setPassword]   = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [remember,   setRemember]   = useState(false);
  const [acFocus,    setAcFocus]    = useState(false);
  const [pwFocus,    setPwFocus]    = useState(false);

  injectAnims();

  const redirect = (() => {
    const raw = searchParams.get("redirect") || "/workbench";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/workbench";
  })();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authApi.login(account, password);
      if (res.token) {
        setAuthToken(res.token, remember);
        syncAuthenticatedUserKeyFromToken(res.token);
        navigate(redirect, { replace: true });
      } else {
        message.error("登录成功但未返回令牌，请检查服务端认证配置");
      }
    } catch {
      message.error("账号或密码错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    background:   focused ? "rgba(59,130,246,.1)"           : "rgba(255,255,255,.05)",
    border:       focused ? "1px solid rgba(96,165,250,.55)" : "1px solid rgba(96,165,250,.18)",
    boxShadow:    focused ? "0 0 0 3px rgba(59,130,246,.12)" : "none",
    borderRadius: 12,
    padding:      "13px 14px 13px 42px",
    fontSize:     14,
    color:        "#fff",
    transition:   "all .2s",
  });

  return (
    <div style={{
      position: "relative",
      width: "100%", minHeight: "100vh",
      overflow: "hidden",
      background: "radial-gradient(ellipse at 30% 40%, #0c1e52 0%, #050c1a 55%, #020810 100%)",
    }}>

      {/* ── Particles ─────────────────────────────────────────────── */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {PARTICLES.map((p) => (
          <div key={p.id} className={p.id % 2 === 0 ? "lw-up" : "lw-down"} style={{
            position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
            width: p.size * 2, height: p.size * 2, borderRadius: "50%",
            background: p.id % 3 === 0 ? "rgba(96,165,250,.5)" : p.id % 3 === 1 ? "rgba(56,189,248,.35)" : "rgba(147,197,253,.22)",
            animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
          }} />
        ))}
      </div>

      {/* ── Grid ──────────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(96,165,250,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(96,165,250,.04) 1px,transparent 1px)",
        backgroundSize: "72px 72px",
      }} />

      {/* ── Scan line ─────────────────────────────────────────────── */}
      <div className="lw-scan" style={{
        height: 1.5,
        background: "linear-gradient(90deg,transparent,rgba(96,165,250,.4) 35%,rgba(147,197,253,.75) 50%,rgba(96,165,250,.4) 65%,transparent)",
      }} />

      {/* ── Glow blobs ────────────────────────────────────────────── */}
      <div className="lw-glow" style={{ width: 700, height: 700, top: "-20%", left: "-8%",  background: "radial-gradient(circle,rgba(59,130,246,.13) 0%,transparent 65%)" }} />
      <div className="lw-glow" style={{ width: 400, height: 400, bottom: "-15%", right: "20%", animationDelay: "-1.8s", background: "radial-gradient(circle,rgba(56,189,248,.08) 0%,transparent 65%)" }} />

      {/* ══════════════════════════════════════════════════════════ */}
      {/*  LOGO — mark + AI Work OS (logo gradient colors)          */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div className="lw-logo-in" style={{
        position: "absolute", top: 28, left: 24, zIndex: 20,
        display: "flex", flexDirection: "column", gap: 10,
        opacity: mounted ? 1 : 0, transition: "opacity .4s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo-mark.png?v=5"
            alt=""
            style={{
              height: 40,
              width: "auto",
              maxWidth: 120,
              display: "block",
              objectFit: "contain",
              background: "transparent",
              flexShrink: 0,
              filter: "drop-shadow(0 4px 12px rgba(0,0,0,.35))",
            }}
          />
          <div>
            <p style={{
              margin: 0,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: "0.04em",
              background: "linear-gradient(90deg,#38bdf8 0%,#3b82f6 48%,#7c3aed 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              color: "transparent",
            }}>
              AI Work OS
            </p>
            <p style={{
              margin: 0,
              color: "rgba(191,219,254,.65)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}>
              智能办公操作系统
            </p>
          </div>
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
          padding: "5px 13px", borderRadius: 9999,
          border: "1px solid rgba(96,165,250,.22)", background: "rgba(59,130,246,.12)",
          backdropFilter: "blur(8px)",
        }}>
          <span className="lw-badge-dot" style={{
            position: "relative", display: "block",
            width: 5, height: 5, borderRadius: "50%", background: "#60a5fa", flexShrink: 0,
          }} />
          <span style={{ color: "rgba(191,219,254,.85)", fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            下一代 AI 办公平台
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/*  MAIN — two columns (center promo | right login)          */}
      {/* ══════════════════════════════════════════════════════════ */}
      <div style={{
        position: "relative", zIndex: 10,
        width: "100%", minHeight: "100vh",
        display: "flex", flexDirection: "row", alignItems: "center",
        opacity: mounted ? 1 : 0, transition: "opacity .45s",
      }}>

        {/* ════ CENTER: promo content ════ */}
        <div className="lw-hero-in" style={{
          flex: 1,
          display: "flex", flexDirection: "column", alignItems: "center",
          textAlign: "center",
          padding: "60px 5vw 60px",
          gap: 28,
          minWidth: 0,
        }}>

          {/* Headline */}
          <div>
            <h1 style={{ margin: "0 0 16px", fontSize: 58, fontWeight: 900, lineHeight: 1.1 }}>
              <span style={{ color: "#fff" }}>智能办公</span><br />
              <span style={{
                background: "linear-gradient(135deg,#93c5fd 0%,#38bdf8 45%,#60a5fa 75%,#a5f3fc 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                filter: "drop-shadow(0 0 20px rgba(96,165,250,.45))",
              }}>从此不同</span>
            </h1>
            <p style={{ margin: "0 auto", color: "rgba(147,197,253,.4)", fontSize: 14, lineHeight: 1.9, maxWidth: 420 }}>
              整合智能体、知识库、任务编排与多渠道协作，<br />为企业打造下一代 AI 办公引擎。
            </p>
          </div>

          {/* 3 highlights — horizontal row */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", maxWidth: 640 }}>
            {HIGHLIGHTS.map((h, idx) => (
              <div key={h.title} className={`lw-hl lw-feat-${idx + 1}`} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 18px", borderRadius: 14,
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(96,165,250,.1)",
                transition: "background .18s, border-color .18s",
                minWidth: 180, flex: "1 1 180px",
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(59,130,246,.18)", border: "1px solid rgba(96,165,250,.28)",
                }}>
                  <i className={h.icon} style={{ color: "rgba(147,197,253,.9)", fontSize: 15 }} />
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ margin: "0 0 2px", color: "rgba(255,255,255,.8)", fontSize: 13, fontWeight: 600 }}>{h.title}</p>
                  <p style={{ margin: 0, color: "rgba(147,197,253,.38)", fontSize: 11 }}>{h.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
            {[{ val: "∞", label: "无限扩展" }, { val: "100%", label: "AI 驱动" }, { val: "24/7", label: "全天候在线" }].map((s) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                <span style={{
                  fontSize: 26, fontWeight: 900,
                  background: "linear-gradient(135deg,#93c5fd,#38bdf8)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{s.val}</span>
                <span style={{ color: "rgba(147,197,253,.3)", fontSize: 11 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ════ RIGHT: login card ════ */}
        <div style={{
          flexShrink: 0,
          width: "clamp(400px, 38%, 520px)",
          padding: "80px 7vw 60px 16px",
          boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div className="lw-card-in" style={{
            width: "100%", maxWidth: 420,
            borderRadius: 24, position: "relative", overflow: "hidden",
            background: "rgba(5,12,40,0.86)",
            backdropFilter: "blur(32px)", WebkitBackdropFilter: "blur(32px)",
            border: "1px solid rgba(96,165,250,.16)",
            boxShadow: "0 0 0 1px rgba(96,165,250,.05),0 32px 80px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.07)",
          }}>
            {/* Top shimmer */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(147,197,253,.5) 35%,rgba(56,189,248,.75) 50%,rgba(147,197,253,.5) 65%,transparent)" }} />
            {/* Inner glow */}
            <div style={{ position: "absolute", top: -80, right: -60, width: 200, height: 200, borderRadius: "50%", pointerEvents: "none", background: "radial-gradient(circle,rgba(59,130,246,.1) 0%,transparent 70%)" }} />

            <div style={{ padding: "36px 36px 32px" }}>

              {/* Card header — mark + gradient title */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                <img
                  src="/logo-mark.png?v=5"
                  alt=""
                  style={{
                    height: 32,
                    width: "auto",
                    maxWidth: 96,
                    display: "block",
                    objectFit: "contain",
                    background: "transparent",
                    flexShrink: 0,
                    filter: "drop-shadow(0 2px 8px rgba(59,130,246,.35))",
                  }}
                />
                <div>
                  <p style={{
                    margin: 0,
                    fontWeight: 700,
                    fontSize: 13,
                    lineHeight: 1.3,
                    background: "linear-gradient(90deg,#38bdf8 0%,#3b82f6 48%,#7c3aed 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    color: "transparent",
                  }}>
                    AI Work OS
                  </p>
                  <p style={{ margin: 0, color: "rgba(96,165,250,.4)", fontSize: 10, letterSpacing: "0.14em" }}>
                    智能办公操作系统
                  </p>
                </div>
              </div>

              {/* Welcome */}
              <div style={{ marginBottom: 24 }}>
                <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>
                  欢迎回来
                </h2>
                <p style={{ margin: 0, color: "rgba(147,197,253,.4)", fontSize: 13 }}>
                  请登录您的 AI Work OS 账号
                </p>
              </div>

              <div style={{ height: 1, marginBottom: 24, background: "linear-gradient(90deg,rgba(96,165,250,.18),rgba(96,165,250,.05) 80%,transparent)" }} />

              {/* Form */}
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }} autoComplete="off">

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(147,197,253,.5)", paddingLeft: 2 }}>账号</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                      <i className="ri-user-3-line" style={{ fontSize: 15, color: "rgba(96,165,250,.4)" }} />
                    </div>
                    <input type="text" value={account} onChange={e => setAccount(e.target.value)}
                      onFocus={() => setAcFocus(true)} onBlur={() => setAcFocus(false)}
                      placeholder="请输入账号或邮箱" className="lw-input"
                      style={inputStyle(acFocus)} />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(147,197,253,.5)", paddingLeft: 2 }}>密码</label>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                      <i className="ri-lock-password-line" style={{ fontSize: 15, color: "rgba(96,165,250,.4)" }} />
                    </div>
                    <input type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                      onFocus={() => setPwFocus(true)} onBlur={() => setPwFocus(false)}
                      placeholder="请输入密码" className="lw-input"
                      style={{ ...inputStyle(pwFocus), paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                      background: "none", border: "none", cursor: "pointer",
                      color: "rgba(96,165,250,.35)", borderRadius: 6, transition: "color .18s",
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(147,197,253,.8)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(96,165,250,.35)"; }}
                    >
                      <i className={showPwd ? "ri-eye-off-line" : "ri-eye-line"} style={{ fontSize: 16 }} />
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                    <div onClick={() => setRemember(!remember)} style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all .18s",
                      background: remember ? "linear-gradient(135deg,#3b82f6,#0ea5e9)" : "rgba(255,255,255,.06)",
                      border: remember ? "1px solid rgba(59,130,246,.6)" : "1px solid rgba(96,165,250,.2)",
                      boxShadow: remember ? "0 0 8px rgba(59,130,246,.3)" : "none",
                    }}>
                      {remember && <i className="ri-check-line" style={{ color: "#fff", fontSize: 10 }} />}
                    </div>
                    <span style={{ fontSize: 12, color: "rgba(147,197,253,.42)" }}>记住我</span>
                  </label>
                </div>

                <button type="submit" disabled={loading} className="lw-btn"
                  style={{
                    position: "relative", overflow: "hidden",
                    width: "100%", padding: "14px 0", marginTop: 4,
                    borderRadius: 12, border: "none",
                    background: loading ? "linear-gradient(135deg,#2563eb,#0284c7)" : "linear-gradient(135deg,#3b82f6,#0ea5e9)",
                    boxShadow: loading ? "none" : "0 0 28px rgba(59,130,246,.4),inset 0 1px 0 rgba(255,255,255,.14)",
                    color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "0.2em",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.72 : 1, transition: "all .2s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {loading ? (
                    <>
                      <i className="ri-loader-4-line lw-spin" style={{ fontSize: 16 }} />
                      <span>登录中...</span>
                    </>
                  ) : (
                    <span style={{ position: "relative", zIndex: 1 }}>
                      登 录
                    </span>
                  )}
                </button>
              </form>

              <div style={{ marginTop: 18, display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "rgba(147,197,253,.26)" }}>还没有账号？请联系管理员开通</span>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
