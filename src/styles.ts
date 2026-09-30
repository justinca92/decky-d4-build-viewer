// Scoped styles for the QAM panel (every class starts with d4-). Steam adds .gpfocus to the focused element.
export const CSS = `
.d4 { --fg:#dcdedf; --dim:#8b929a; --row:#202833; --focus:#dfe3e6; --onfocus:#0e141b; --accent:#1a9fff; --ember:#d0673f; --gold:#d6a84a; --line:#2a323d; color:var(--fg); }
.d4 * { box-sizing:border-box; }
.d4-row { display:flex; align-items:center; gap:10px; padding:9px 10px; border-radius:4px; line-height:1.35; }
.d4-row.gpfocus, .d4-note.gpfocus, .d4-btn.gpfocus { background:var(--focus); color:var(--onfocus); }
.d4-row.gpfocus .d4-sub, .d4-row.gpfocus .d4-chev, .d4-row.gpfocus .d4-slot, .d4-note.gpfocus .d4-peek { color:#3d4652; }
.d4-grow { flex:1; min-width:0; }
.d4-sub { color:var(--dim); font-size:12px; }
.d4-one { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.d4-chev { color:var(--dim); font-size:12px; flex:none; }
.d4-sec { margin-top:8px; background:#1c232d; font-weight:500; }
.d4-h { font-size:11px; font-weight:700; letter-spacing:.09em; text-transform:uppercase; color:var(--dim); padding:14px 6px 6px; display:flex; justify-content:space-between; }
.d4-btn { display:flex; align-items:center; justify-content:center; gap:8px; background:#2f3b4a; border-radius:4px; padding:11px; font-weight:500; margin:2px 0; }
.d4-danger { background:#3a1c1c; color:#f2a3a3; }
.d4-danger.gpfocus { background:#f2a3a3; color:#3a0d0d; }
.d4-head { padding:10px; border-radius:4px; background:linear-gradient(135deg,#2e1c14,var(--row)); display:grid; gap:5px; }
.d4-cls { font-size:11px; color:var(--ember); font-weight:700; letter-spacing:.06em; }
.d4-title { margin:0; font-size:16px; line-height:1.3; font-weight:700; }
.d4-meta { display:flex; gap:6px; flex-wrap:wrap; font-size:11px; color:var(--dim); }
.d4-chips { display:flex; gap:4px; flex-wrap:wrap; }
.d4-pill { font-size:10px; font-weight:700; padding:2px 6px; border-radius:3px; background:#2f3b4a; color:var(--fg); white-space:nowrap; }
.d4-pill.str { background:#1f3326; color:#8fd19e; white-space:normal; line-height:1.4; }
.d4-pill.myth { background:#4b2352; color:#e7a6f2; } .d4-pill.uni { background:#5a3d17; color:#f0c779; } .d4-pill.leg { background:#5a2a14; color:#f3a877; }
.d4-skillbar { display:grid; grid-template-columns:repeat(6,1fr); gap:5px; padding:6px 4px 2px; }
.d4-sk { aspect-ratio:1; border:1px solid #5a3a28; background:radial-gradient(circle at 50% 35%,#3a2216,#140e0b); border-radius:3px; display:grid; place-items:center; font-size:10px; color:#f0cfb0; position:relative; overflow:hidden; }
.d4-sk img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.d4-sk em { position:absolute; bottom:0; right:3px; font-style:normal; font-size:9px; color:#e8d8c4; text-shadow:0 0 3px #000; z-index:2; }
.d4-list { padding:4px 8px 8px 10px; display:grid; gap:5px; font-size:12.5px; }
.d4-it { display:flex; gap:8px; align-items:baseline; }
.d4-n { font-size:10.5px; color:var(--dim); width:18px; flex:none; text-align:right; }
.d4-k { color:var(--dim); width:64px; flex:none; font-size:11.5px; }
.d4-v { flex:1; min-width:0; }
.d4-ico { width:20px; height:20px; border-radius:3px; vertical-align:-5px; margin-right:6px; border:1px solid #5a3a28; }
.d4-iicon { position:relative; display:inline-block; flex:none; overflow:hidden; border-radius:3px; background:radial-gradient(circle at 50% 40%,#2c2419,#120f0c); border:1px solid #3a3226; }
.d4-iicon img { width:100%; height:100%; object-fit:contain; display:block; }
.d4-slot { font-size:11px; color:var(--dim); width:56px; flex:none; }
.d4-nm { font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.d4-affs { margin:2px 4px 8px 66px; display:grid; gap:3px; font-size:12px; }
.d4-aff { display:flex; gap:6px; align-items:baseline; }
.d4-val { font-size:11px; width:52px; text-align:right; flex:none; }
.d4-lbl { flex:1; min-width:0; color:#c3c7cb; }
.d4-fl { display:inline-flex; gap:3px; flex:none; }
.d4-fl b { font-size:9px; font-weight:700; padding:0 4px; border-radius:2px; line-height:15px; }
.d4-fl .T { background:#20354a; color:#8cc4f3; } .d4-fl .G { background:#4a3a14; color:#f2cf6b; } .d4-fl .M { background:#3d2a4a; color:#d9b1f2; } .d4-fl .X { background:#1f3a33; color:#86dcc4; }
.d4-legend { display:flex; gap:8px; flex-wrap:wrap; font-size:10.5px; color:var(--dim); padding:2px 10px 6px; }
.d4-small { font-size:11px; color:var(--dim); }
.d4-note { margin:6px 4px 10px; padding:9px 11px 10px; background:#1a1f27; border-left:3px solid var(--gold); border-radius:0 5px 5px 0; font-size:13px; line-height:1.6; color:#d4d7da; }
.d4-note.empty { border-left-color:var(--line); color:var(--dim); font-size:12px; }
.d4-note.info { border-left-color:var(--accent); }
.d4-note-h { display:flex; justify-content:space-between; align-items:baseline; font-size:11px; font-weight:700; color:var(--gold); margin-bottom:4px; }
.d4-note.info .d4-note-h { color:var(--accent); }
.d4-note ul, .d4-note ol { margin:0; padding-left:18px; display:grid; gap:6px; }
.d4-peek { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--dim); font-size:12px; }
.d4-tip { margin-top:8px; padding:6px 8px; background:#25201a; border-radius:4px; font-size:12px; }
.d4-chip { padding:1px 5px; border-radius:3px; font-size:12px; font-weight:500; }
.d4-chip.m { background:#3a1f40; color:#e7a6f2; } .d4-chip.u { background:#3f2e14; color:#f0c779; } .d4-chip.l { background:#43230f; color:#f3a877; } .d4-chip.r { background:#1c2c40; color:#9cc7f0; } .d4-chip.s { background:#3a2216; color:#f0cfb0; }
.d4-qr { background:#fff; padding:10px; border-radius:6px; width:200px; height:200px; margin:6px auto 0; display:grid; place-items:center; }
.d4-qr svg { width:180px; height:180px; display:block; }
.d4-addr { font-size:12px; color:var(--accent); text-align:center; margin-top:6px; }
.d4-center { text-align:center; font-size:12px; color:var(--dim); line-height:1.5; }
.d4-status { display:flex; align-items:center; gap:8px; font-size:12px; background:var(--row); padding:8px 10px; border-radius:4px; margin-top:6px; }
.d4-dot { width:8px; height:8px; border-radius:50%; background:var(--gold); flex:none; }
.d4-dot.ok { background:#59bf40; } .d4-dot.bad { background:#e0584a; }
.d4-bar { height:10px; background:#0f1419; border-radius:5px; overflow:hidden; border:1px solid var(--line); margin:8px 0 4px; }
.d4-bar > div { height:100%; background:linear-gradient(90deg,var(--accent),#5ec2ff); transition:width .2s linear; }
.d4-step { display:flex; gap:10px; align-items:flex-start; padding:7px 8px; border-radius:4px; font-size:13px; }
.d4-step.run { background:#1c232d; } .d4-step.wait { color:var(--dim); }
.d4-st { width:18px; height:18px; border-radius:50%; flex:none; display:grid; place-items:center; font-size:11px; font-weight:700; margin-top:1px; border:2px solid #3a4450; }
.d4-step.done .d4-st { background:#2d5a26; color:#a5e09a; border:0; }
.d4-step.run .d4-st { border-color:var(--accent); border-right-color:transparent; animation:d4spin .8s linear infinite; }
.d4-step.fail .d4-st { background:#5a2626; color:#f2a3a3; border:0; }
@keyframes d4spin { to { transform:rotate(360deg); } }
.d4-grid { display:grid; grid-template-columns:repeat(10,1fr); gap:3px; padding:2px 8px 4px 36px; }
.d4-grid span { position:relative; aspect-ratio:1; border-radius:2px; background:#1a1f27; border:1px solid #262e38; overflow:hidden; }
.d4-grid img { width:100%; height:100%; display:block; }
.d4-err { font-size:12px; color:#f2a3a3; background:#3a1c1c; border-radius:4px; padding:6px 8px; margin:4px 0; }
.d4-ok { font-size:12.5px; color:#a5e09a; background:#1f3326; border-radius:5px; padding:9px 10px; margin:6px 0; line-height:1.5; }
.d4-del { background:#1a1f27; border-radius:5px; padding:8px 10px; display:grid; gap:4px; font-size:12.5px; }
.d4-del div { display:flex; justify-content:space-between; gap:8px; }
`;
