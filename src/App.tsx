import { Focusable, Navigation, PanelSection, PanelSectionRow, TextField, ToggleField } from "@decky/ui";
import type { GamepadEvent } from "@decky/ui";

// GamepadButton values (FooterLegend.d.ts); kept as numbers so nothing depends on the enum object at runtime
const BUMPER_LEFT = 5, BUMPER_RIGHT = 6;
import { addEventListener, callable, removeEventListener } from "@decky/api";
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { BuildData, DatasetIndex, Lang, Names, Notes, NoteCard, Variant, extractLink, isBuildLink, linkLang, localizeNotes, mentionSources, nameMap, parseBuildPage } from "./parse";
import { CSS } from "./styles";

// ---------- backend ----------
const startReceiver = callable<[], { ok: boolean; ip: string; port: number; token: string; error?: string }>("start_receiver");
const resetAll = callable<[], { ok: boolean; bytes?: number }>("reset_all");
const getVersion = callable<[], string>("get_version");
const getAltNames = callable<[lang: string, src: string], Record<string, string>>("get_alt_names");
const logError = callable<[stage: string, message: string, url: string], void>("log_error");
const stopReceiver = callable<[], void>("stop_receiver");
const fetchPage = callable<[url: string], { ok: boolean; html?: string; bytes?: number; error?: string }>("fetch_page");
const fetchAsset = callable<[url: string], { ok: boolean; uri?: string; error?: string }>("fetch_asset");
const getDataset = callable<[lang: string], DatasetIndex & { error?: string }>("get_dataset");
const listBuilds = callable<[], BuildMeta[]>("list_builds");
const saveBuild = callable<[id: string, build: SavedBuild], { ok: boolean; bytes?: number }>("save_build");
const loadBuild = callable<[id: string], SavedBuild | null>("load_build");
const deleteBuild = callable<[id: string], { ok: boolean; bytes?: number }>("delete_build");
const deleteAllBuilds = callable<[], { ok: boolean; bytes?: number }>("delete_all_builds");
const clearDatasets = callable<[], { ok: boolean; bytes?: number }>("clear_datasets");
const storageInfo = callable<[], { builds: number; datasets: number }>("storage_info");

interface BuildMeta { id: string; title: string; cls: string; lang: Lang; variants: number; icons: number; url: string; savedAt: number; bytes: number }
interface SavedBuild { meta: Omit<BuildMeta, "id" | "bytes" | "savedAt"> & { savedAt?: number }; url: string; lang: Lang; htmlBytes: number; data: BuildData; names: Names; notes: Notes; icons: { items: Record<string, string>; skills: Record<string, string> } }

// ---------- language ----------
declare const SteamClient: any;
export async function steamLanguage(): Promise<Lang> {
  try {
    const l = await SteamClient.Settings.GetCurrentLanguage();
    if (typeof l === "string" && l) return /korean/i.test(l) ? "ko" : "en";
  } catch (e) { /* fall through */ }
  return /^ko/i.test(navigator.language || "") ? "ko" : "en";
}
const tr = (lang: Lang) => (ko: string, en: string) => (lang === "en" ? en : ko);

const LL = {
  ko: {
    cls: { warlock: "흑마법사", necromancer: "강령술사", sorcerer: "원소술사", barbarian: "야만용사", rogue: "도적", druid: "드루이드", spiritborn: "혼령사", paladin: "성기사" } as Record<string, string>,
    act: { endgame: "엔드게임", speed_farm: "스피드 파밍", pit_push: "나락 푸시", meta: "메타", boss_killer: "보스 파밍", leveling: "레벨업", beginner: "입문" } as Record<string, string>,
    slot: { helm: "투구", chest: "가슴", gloves: "장갑", pants: "바지", boots: "장화", amulet: "목걸이", ring1: "반지 1", ring2: "반지 2", weapon: "무기", offhand: "보조", mainhand: "주무기", offhandWeapon: "보조 무기", twoHander: "양손 무기" } as Record<string, string>,
    kind: { mythic: ["신화", "myth"], unique: ["고유", "uni"], custom_legendary: ["위상", "leg"], legendary: ["전설", "leg"] } as Record<string, [string, string]>,
    merc: { varyana: "바랴나", raheir: "라헤이르", subo: "수보", aldkin: "알드킨" } as Record<string, string>,
    prime: { destruction: "파괴 (바알)", hatred: "증오 (메피스토)", terror: "공포 (디아블로)" } as Record<string, string>,
    trig: { "Skill Cast": "스킬 시전 시", Injured: "부상 시" } as Record<string, string>,
    stat: { willpower: "의지력", intelligence: "지능", strength: "힘", dexterity: "민첩" } as Record<string, string>,
    minion: { golem: "골렘", mages: "해골 마법학자", warriors: "해골 전사" } as Record<string, string>,
    minionType: { Iron: "강철", Blood: "피", Bone: "뼈", Shadow: "암흑", Cold: "냉기", Reaper: "수확자", Skirmisher: "약탈자", Defender: "수호자" } as Record<string, string>,
    flag: { T: "담금질", G: "상위", M: "명품화", X: "변성" } as Record<string, string>
  },
  en: {
    cls: { warlock: "Warlock", necromancer: "Necromancer", sorcerer: "Sorcerer", barbarian: "Barbarian", rogue: "Rogue", druid: "Druid", spiritborn: "Spiritborn", paladin: "Paladin" } as Record<string, string>,
    act: { endgame: "Endgame", speed_farm: "Speed Farm", pit_push: "Pit Push", meta: "Meta", boss_killer: "Boss Killer", leveling: "Leveling", beginner: "Beginner" } as Record<string, string>,
    slot: { helm: "Helm", chest: "Chest", gloves: "Gloves", pants: "Pants", boots: "Boots", amulet: "Amulet", ring1: "Ring 1", ring2: "Ring 2", weapon: "Weapon", offhand: "Off-hand", mainhand: "Main hand", offhandWeapon: "Off-hand weapon", twoHander: "Two-handed" } as Record<string, string>,
    kind: { mythic: ["Mythic", "myth"], unique: ["Unique", "uni"], custom_legendary: ["Aspect", "leg"], legendary: ["Legendary", "leg"] } as Record<string, [string, string]>,
    merc: { varyana: "Varyana", raheir: "Raheir", subo: "Subo", aldkin: "Aldkin" } as Record<string, string>,
    prime: { destruction: "Destruction (Baal)", hatred: "Hatred (Mephisto)", terror: "Terror (Diablo)" } as Record<string, string>,
    trig: { "Skill Cast": "On skill cast", Injured: "When injured" } as Record<string, string>,
    stat: { willpower: "Willpower", intelligence: "Intelligence", strength: "Strength", dexterity: "Dexterity" } as Record<string, string>,
    minion: { golem: "Golem", mages: "Skeleton Mage", warriors: "Skeleton Warrior" } as Record<string, string>,
    minionType: { Iron: "Iron", Blood: "Blood", Bone: "Bone", Shadow: "Shadow", Cold: "Cold", Reaper: "Reaper", Skirmisher: "Skirmisher", Defender: "Defender" } as Record<string, string>,
    flag: { T: "Tempered", G: "Greater", M: "Masterwork", X: "Transfigured" } as Record<string, string>
  }
};

// ---------- small helpers ----------
const title = (s: string) => String(s || "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const initials = (s: string) => s.split("_").filter(Boolean).map(w => w[0].toUpperCase()).join("").slice(0, 3);
const shortAff = (id: string) => id.replace(/^affix-(\d+-)?(affix-)?(s04-|x2-transfiguration-|x2-)?/, "").replace(/^tempered-/, "");
const isPct = (id: string) => /speed|crit|damage|reduction|gem|resourcegain|cost|pct|percent|cdr|resist/.test(id) && !/weapon-damage/.test(id);
const isRank = (id: string) => /rank|all-skills/.test(id);
const fmtVal = (id: string, v: any) => (isRank(id) ? "+" + v : isPct(id) ? v + "%" : Number(v).toLocaleString("en-US"));
const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const pairs = (a: any[]) => { const o: [string, number][] = []; for (let i = 0; i < a.length; i += 2) o.push([a[i], a[i + 1]]); return o; };
const triples = (a: any[]) => { const o: { id: string; v: any; f: string }[] = []; for (let i = 0; i < a.length; i += 3) o.push({ id: a[i], v: a[i + 1], f: a[i + 2] || "" }); return o; };
const SLOT_ORDER = ["helm", "chest", "gloves", "pants", "boots", "weapon", "twoHander", "mainhand", "offhandWeapon", "offhand", "amulet", "ring1", "ring2"];

function Chips({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0, k = 0;
  for (const m of text.matchAll(/\{([mulrs]):([^}]+)\}/g)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(<span key={k++} className={"d4-chip " + m[1]}>{m[2]}</span>);
    last = m.index! + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
const plain = (s: string) => s.replace(/\{[mulrs]:([^}]+)\}/g, "$1");

// "Open original" link carries a source tag so the build site can count the visits the plugin sends back.
// Only on the page the player chooses to open; the plugin's own page fetches stay untagged.
function withUtm(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "decky-d4-build-viewer");
    u.searchParams.set("utm_medium", "steam-deck-plugin");
    return u.toString();
  } catch (e) {
    return url;
  }
}

function Row(props: { onActivate?: () => void; className?: string; children: ReactNode; style?: any }) {
  const act = props.onActivate || (() => {});
  return <Focusable className={"d4-row " + (props.className || "")} style={props.style} onActivate={act} onClick={act}>{props.children}</Focusable>;
}
function Btn(props: { onActivate: () => void; danger?: boolean; children: ReactNode }) {
  return <Focusable className={"d4-btn" + (props.danger ? " d4-danger" : "")} onActivate={props.onActivate} onClick={props.onActivate}>{props.children}</Focusable>;
}

// crop an icon (optionally out of an atlas) into a small square webp data URI
function crop(src: string, uv?: number[], size = 72): Promise<string> {
  return new Promise((ok, no) => {
    const im = new Image();
    im.onload = () => {
      const W = im.naturalWidth, H = im.naturalHeight;
      const [sx, sy, sw, sh] = uv ? [uv[0] * W, uv[1] * H, (uv[2] - uv[0]) * W, (uv[3] - uv[1]) * H] : [0, 0, W, H];
      const c = document.createElement("canvas"); c.width = c.height = size;
      const s = size / Math.max(sw, sh), w = sw * s, h = sh * s;
      c.getContext("2d")!.drawImage(im, sx, sy, sw, sh, (size - w) / 2, (size - h) / 2, w, h);
      ok(c.toDataURL("image/webp", 0.86));
    };
    im.onerror = () => no(new Error("image"));
    im.src = src;
  });
}

// links sent from the phone arrive as a backend event; index.tsx forwards them here
export const LINK_EVENT = "d4bv-link";

// ---------- app ----------
type Screen = "home" | "qr" | "loading" | "build" | "confirm";
interface Step { t: string; d: string; err?: string }
interface Job { url: string; lang: Lang; steps: Step[]; step: number; pct: number; icons: string[]; total: number; done: boolean; failed: boolean }

let memo: { screen: Screen; buildId?: string } = { screen: "home" };

export function App() {
  const [ui, setUi] = useState<Lang>("ko");
  const [screen, setScreenState] = useState<Screen>(memo.screen === "loading" || memo.screen === "confirm" ? "home" : memo.screen);
  const [builds, setBuilds] = useState<BuildMeta[]>([]);
  const [store, setStore] = useState({ builds: 0, datasets: 0 });
  const [toast, setToast] = useState<string>("");
  const [cur, setCur] = useState<{ id: string; b: SavedBuild } | null>(null);
  // a build id, "all" (every saved build) or "reset" (builds + dataset cache + settings + log)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const jobRef = useRef<Job | null>(null);
  const t = tr(ui);

  const setScreen = (s: Screen) => { memo.screen = s; setScreenState(s); };
  const refresh = async () => { setBuilds(await listBuilds()); setStore(await storageInfo()); };

  const [version, setVersion] = useState("");
  useEffect(() => {
    steamLanguage().then(setUi);
    getVersion().then(v => setVersion(String(v || ""))).catch(() => {});
    refresh();
    if (memo.screen === "build" && memo.buildId) openBuild(memo.buildId);
  }, []);

  async function openBuild(id: string) {
    const b = await loadBuild(id);
    if (!b) { memo = { screen: "home" }; setScreenState("home"); return; }
    setCur({ id, b }); memo.buildId = id; setScreen("build");
  }

  // ---------- load a link: fetch → parse → names → icons → save ----------
  async function load(rawUrl: string) {
    const url = extractLink(rawUrl);
    const lang = linkLang(url), S = tr(lang);
    const steps: Step[] = [
      { t: S("링크 확인", "Check link"), d: `${url.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/")} · ${S("한국어", "English")}` },
      { t: S("페이지 받기", "Fetch page"), d: "" },
      { t: S("빌드 해석", "Parse build"), d: "" },
      { t: S("이름 데이터셋", "Name dataset"), d: S("처음 한 번만 받습니다 · 약 16MB", "first time only · about 16 MB") },
      { t: S("아이콘 받기", "Download icons"), d: "" },
      { t: S("저장", "Save"), d: "" }
    ];
    const j: Job = { url, lang, steps, step: 0, pct: 2, icons: [], total: 0, done: false, failed: false };
    jobRef.current = j; setJob({ ...j }); setScreen("loading");
    const upd = (patch: Partial<Job> = {}) => { if (jobRef.current !== j) throw new Error("cancelled"); Object.assign(j, patch); setJob({ ...j, steps: [...j.steps] }); };
    const onDs = (lg: string, n: number, all: number) => { if (jobRef.current === j && lg === lang) { steps[3].d = S(`데이터셋 ${n}/${all}`, `dataset ${n}/${all}`); j.pct = 30 + (n / all) * 25; setJob({ ...j, steps: [...steps] }); } };
    const dsListener = addEventListener<[string, number, number]>("dataset_progress", onDs);
    try {
      upd({ step: 1, pct: 5 });
      const page = await fetchPage(url);
      if (!page.ok || !page.html) throw new Error(S("페이지를 받지 못했습니다", "Could not fetch the page") + (page.error ? ` (${page.error})` : ""));
      steps[1].d = kb(page.bytes || page.html.length);
      upd({ step: 2, pct: 20 });
      let p: ReturnType<typeof parseBuildPage>;
      try { p = parseBuildPage(page.html, lang); }
      catch (e: any) { throw new Error(S("빌드를 해석하지 못했습니다. 인피니티빌드 사이트 구조가 바뀌었을 수 있어요. 플러그인 업데이트를 기다려 주세요.", "Couldn't read this build. InfinityBuilds may have changed its pages; please wait for a plugin update.") + ` (${e.message || e})`); }
      steps[2].d = S(`변형 ${p.data.variants.length}개 · ${p.data.title.slice(0, 24)}`, `${p.data.variants.length} variants · ${p.data.title.slice(0, 24)}`);
      upd({ step: 3, pct: 30 });
      const ds = await getDataset(lang);
      if ((ds as any).error || !ds.labels) throw new Error(S("이름 데이터셋을 받지 못했습니다", "Could not get the name dataset"));
      const names = nameMap(p.raw, ds);
      // guide mentions written by name in another language (English, Chinese) need that language's names once
      const alt: Record<string, string> = {};
      for (const src of mentionSources(p.notes, lang)) {
        steps[3].d = S(`작성자 설명 이름 변환 (${src})`, `Translating guide names (${src})`); upd();
        Object.assign(alt, await getAltNames(lang, src).catch(() => ({})));
      }
      const notes = localizeNotes(p.notes, ds, p.data.cls, alt);
      steps[3].d = S(`${Object.keys(names.map).length}/${names.total}개 매칭`, `${Object.keys(names.map).length}/${names.total} matched`);
      // icons: fetch each source once (atlases are shared inside a build), crop to 72/64 px, keep only the crops
      const items = Object.entries(p.itemIcons), skills = Object.entries(p.skillIcons);
      const total = items.length + skills.length;
      upd({ step: 4, pct: 55, total, icons: [] });
      const srcCache: Record<string, Promise<string | null>> = {};
      const src = (u: string) => srcCache[u] || (srcCache[u] = fetchAsset(u).then(r => (r.ok && r.uri ? r.uri : null)));
      const out = { items: {} as Record<string, string>, skills: {} as Record<string, string> };
      const tasks: (() => Promise<void>)[] = [
        ...skills.map(([ic, u]) => async () => {
          const s = (await src(u)) || (await src(u.replace(/\.webp$/, ".png")));
          if (s) out.skills[ic] = await crop(s, undefined, 64).catch(() => "");
          j.icons.push(out.skills[ic] || "");
        }),
        ...items.map(([id, ic]) => async () => {
          const s = await src(ic.url);
          if (s) out.items[id] = await crop(s, ic.uv, 72).catch(() => "");
          j.icons.push(out.items[id] || "");
        })
      ];
      let next = 0;
      const worker = async () => { while (next < tasks.length) { const k = next++; await tasks[k](); upd({ pct: 55 + (j.icons.length / Math.max(1, total)) * 40 }); } };
      await Promise.all([worker(), worker(), worker()]);
      steps[4].d = S(`${j.icons.filter(Boolean).length}/${total}개`, `${j.icons.filter(Boolean).length}/${total}`);
      upd({ step: 5, pct: 97 });
      const id = (p.data.slug + "-" + lang).replace(/[^\w-]/g, "").slice(0, 120);
      const iconCount = Object.values(out.items).filter(Boolean).length + Object.values(out.skills).filter(Boolean).length;
      const saved: SavedBuild = {
        meta: { title: p.data.title, cls: p.data.cls, lang, variants: p.data.variants.length, icons: iconCount, url },
        url, lang, htmlBytes: page.bytes || 0, data: p.data, names, notes, icons: out
      };
      const r = await saveBuild(id, saved);
      steps[5].d = `builds/${id.slice(0, 22)}….json · ${kb(r.bytes || 0)}`;
      upd({ step: 6, pct: 100, done: true });
      await refresh();
      setTimeout(() => { if (jobRef.current === j) { jobRef.current = null; setJob(null); openBuild(id); } }, 700);
    } catch (e: any) {
      if (jobRef.current === j && e.message !== "cancelled") {
        const st = steps[Math.min(j.step, 5)];
        const msg: string = e.message || String(e);
        st.err = msg;
        logError(st.t, msg, url).catch(() => {});
        upd({ failed: true });
      }
    } finally {
      removeEventListener("dataset_progress", dsListener);
    }
  }
  const cancelLoad = () => { jobRef.current = null; setJob(null); setToast(t("받기를 취소했습니다. 받던 데이터는 저장하지 않았습니다.", "Cancelled. Nothing was saved.")); setScreen("home"); };

  async function doDelete() {
    if (pendingDelete === "reset") {
      const r = await resetAll();
      setToast(t(`모두 초기화했습니다 · ${kb(r.bytes || 0)} 삭제. 설치 직후와 같은 상태입니다.`, `Everything was reset · ${kb(r.bytes || 0)} deleted. Same as a fresh install.`));
      setPendingDelete(null); setCur(null); memo = { screen: "home" };
      await refresh(); setScreen("home");
      return;
    }
    const r = pendingDelete === "all" ? await deleteAllBuilds() : await deleteBuild(pendingDelete as string);
    const n = pendingDelete === "all" ? builds.length : 1;
    setToast(t(`삭제했습니다 · 빌드 ${n}개, ${kb(r.bytes || 0)} 제거. 남은 기록이 없습니다.`, `Deleted · ${n} build(s), ${kb(r.bytes || 0)} removed. Nothing is left behind.`));
    setPendingDelete(null); setCur(null); memo = { screen: "home" };
    await refresh(); setScreen("home");
  }

  const back = () => { if (screen === "loading") return cancelLoad(); if (screen === "confirm") { setScreen(pendingDelete === "all" || pendingDelete === "reset" ? "home" : "build"); setPendingDelete(null); return; } setScreen("home"); };

  return (
    <div className="d4">
      <style>{CSS}</style>
      {screen !== "home" && (
        <PanelSectionRow><Row onActivate={back}><span className="d4-chev">‹</span><div className="d4-grow">{screen === "loading" ? t("취소", "Cancel") : t("뒤로", "Back")}</div></Row></PanelSectionRow>
      )}
      {screen === "home" && <Home ui={ui} version={version} builds={builds} store={store} toast={toast} onQr={() => { setToast(""); setScreen("qr"); }}
        onOpen={id => { setToast(""); openBuild(id); }} onDeleteAll={() => { setPendingDelete("all"); setScreen("confirm"); }}
        onReset={() => { setPendingDelete("reset"); setScreen("confirm"); }}
        onClearDs={async () => { const r = await clearDatasets(); setToast(t(`이름 데이터셋 캐시를 비웠습니다 · ${kb(r.bytes || 0)}`, `Cleared the name dataset cache · ${kb(r.bytes || 0)}`)); refresh(); }} />}
      {screen === "qr" && <Qr ui={ui} onLink={u => load(u)} />}
      {screen === "loading" && job && <Loading job={job} onCancel={cancelLoad} />}
      {screen === "build" && cur && <BuildView b={cur.b} bytes={builds.find(x => x.id === cur.id)?.bytes || 0}
        onDelete={() => { setPendingDelete(cur.id); setScreen("confirm"); }} />}
      {screen === "confirm" && pendingDelete && <Confirm ui={ui} target={pendingDelete} builds={builds} cur={cur} onYes={doDelete} onNo={back} />}
    </div>
  );
}

// ---------- home ----------
function Home(p: { ui: Lang; version: string; builds: BuildMeta[]; store: { builds: number; datasets: number }; toast: string; onQr: () => void; onOpen: (id: string) => void; onDeleteAll: () => void; onReset: () => void; onClearDs: () => void }) {
  const t = tr(p.ui), L = LL[p.ui];
  const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 6e4); if (m < 1) return t("방금", "just now"); if (m < 60) return t(`${m}분 전`, `${m} min ago`); const h = Math.round(m / 60); if (h < 24) return t(`${h}시간 전`, `${h} h ago`); return t(`${Math.round(h / 24)}일 전`, `${Math.round(h / 24)} days ago`); };
  return (
    <>
      <PanelSection title={t("빌드 불러오기", "Load a build")}>
        <PanelSectionRow><Btn onActivate={p.onQr}>{t("휴대폰으로 링크 받기 · 직접 입력", "Get a link from your phone · type it in")}</Btn></PanelSectionRow>
        <PanelSectionRow><div className="d4-small" style={{ padding: "2px 6px" }}>{t("지원: 인피니티빌드(infinitybuilds.gg) 빌드 링크만", "Supported: InfinityBuilds (infinitybuilds.gg) build links only")}</div></PanelSectionRow>
        {p.toast && <PanelSectionRow><div className="d4-ok">{p.toast}</div></PanelSectionRow>}
      </PanelSection>
      <PanelSection title={t(`저장된 빌드 · ${p.builds.length}개 · ${kb(p.store.builds)}`, `Saved builds · ${p.builds.length} · ${kb(p.store.builds)}`)}>
        {!p.builds.length && <PanelSectionRow><div className="d4-note empty">{t("저장된 빌드가 없습니다. 휴대폰으로 링크를 보내거나 직접 입력하면 여기에 쌓입니다.", "No saved builds yet. Links you send or enter will show up here.")}</div></PanelSectionRow>}
        {p.builds.map(b => (
          <PanelSectionRow key={b.id}>
            <Row onActivate={() => p.onOpen(b.id)}>
              <div className="d4-grow"><div className="d4-one">{b.title}</div>
                <div className="d4-sub d4-one">{L.cls[b.cls] || b.cls} · {String(b.lang).toUpperCase()} · {t(`변형 ${b.variants}`, `${b.variants} variants`)} · {kb(b.bytes)} · {ago(b.savedAt)}</div></div>
              <span className="d4-chev">›</span>
            </Row>
          </PanelSectionRow>
        ))}
      </PanelSection>
      <PanelSection title={t("설정", "Settings")}>
        <PanelSectionRow><Row><div className="d4-grow">{t("언어", "Language")}<div className="d4-sub">{t("Steam 설정을 따름 · 빌드 화면은 링크 언어", "Follows Steam · build pages follow the link")}</div></div><span className="d4-chev">{t("한국어", "English")}</span></Row></PanelSectionRow>
        <PanelSectionRow><Row onActivate={p.onClearDs}><div className="d4-grow">{t("이름 데이터셋 캐시 비우기", "Clear name dataset cache")}<div className="d4-sub">{kb(p.store.datasets)} · {t("다음 빌드를 받을 때 다시 받습니다", "downloaded again with the next build")}</div></div></Row></PanelSectionRow>
        {p.builds.length > 0 && <PanelSectionRow><Row onActivate={p.onDeleteAll}><div className="d4-grow">{t("저장된 빌드 모두 삭제", "Delete all saved builds")}<div className="d4-sub">{t(`빌드 ${p.builds.length}개`, `${p.builds.length} builds`)} · {kb(p.store.builds)}</div></div></Row></PanelSectionRow>}
        <PanelSectionRow><Row onActivate={p.onReset}><div className="d4-grow">{t("모두 초기화", "Reset everything")}<div className="d4-sub">{t("빌드·캐시·설정·로그를 지우고 설치 직후 상태로", "Delete builds, cache, settings and log; back to a fresh install")}</div></div></Row></PanelSectionRow>
        <PanelSectionRow><div className="d4-small" style={{ padding: "4px 6px" }}>{t("플러그인을 Decky에서 지우면 저장된 빌드, 데이터셋 캐시, 설정, 로그가 모두 삭제됩니다.", "Uninstalling the plugin in Decky deletes all saved builds, the dataset cache, settings and logs.")}</div></PanelSectionRow>
      </PanelSection>
      <PanelSection title={t("정보", "About")}>
        <PanelSectionRow><Row><div className="d4-grow">D4 Build Viewer<div className="d4-sub">{t("설치된 버전", "Installed version")}</div></div><span className="d4-chev" style={{ fontSize: 13 }}>{p.version ? "v" + p.version : "…"}</span></Row></PanelSectionRow>
        <PanelSectionRow><div className="d4-small" style={{ padding: "2px 6px", lineHeight: 1.5 }}>
          {t("비공식 팬 도구입니다. Blizzard Entertainment 및 InfinityBuilds와 관련이 없습니다. 빌드와 설명은 인피니티빌드 작성자의 것이며, 각 빌드 화면에서 원문을 열 수 있습니다.",
            "Unofficial fan tool, not affiliated with Blizzard Entertainment or InfinityBuilds. Builds and notes belong to their InfinityBuilds authors; open the original from any build page.")}
        </div></PanelSectionRow>
        <PanelSectionRow><div className="d4-small" style={{ padding: "2px 6px", lineHeight: 1.5 }}>
          {t("개인정보: 빌드를 불러올 때 infinitybuilds.gg에서 받아오기만 하고, 스팀덱의 어떤 정보도 밖으로 보내지 않습니다. 분석·광고·계정 연동이 없고 모든 데이터는 이 스팀덱에만 저장됩니다.",
            "Privacy: loading a build only downloads from infinitybuilds.gg; nothing about your Deck is sent anywhere. No analytics, ads or accounts, and all data stays on this Deck.")}
        </div></PanelSectionRow>
      </PanelSection>
    </>
  );
}

// ---------- QR / direct link ----------
function Qr(p: { ui: Lang; onLink: (u: string) => void }) {
  const t = tr(p.ui);
  const [addr, setAddr] = useState<{ ip: string; port: number; token: string } | null>(null);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [text, setText] = useState("");
  const [help, setHelp] = useState(false);
  const onLink = useRef(p.onLink); onLink.current = p.onLink;

  useEffect(() => {
    let alive = true;
    startReceiver().then(r => { if (!alive) return; if (r.ok) setAddr({ ip: r.ip, port: r.port, token: r.token }); else setErr(r.error || "receiver"); });
    const h = (e: Event) => {
      const u = extractLink((e as CustomEvent).detail || "");
      if (!isBuildLink(u)) { setStatus({ ok: false, text: t("인피니티빌드(infinitybuilds.gg) 빌드 링크만 지원합니다", "Only InfinityBuilds (infinitybuilds.gg) build links are supported") }); return; }
      setStatus({ ok: true, text: t("휴대폰에서 링크 받음", "Link received from phone") });
      setTimeout(() => onLink.current(u), 300);
    };
    window.addEventListener(LINK_EVENT, h);
    return () => { alive = false; window.removeEventListener(LINK_EVENT, h); stopReceiver(); };
  }, []);

  // one-time token: a new one each time this screen opens, so only the phone that scans this QR can send
  const url = addr ? `http://${addr.ip}:${addr.port}/s/${addr.token}` : "";
  let svg = "";
  if (url) { const q = qrcode(0, "M"); q.addData(url); q.make(); svg = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
  const submit = () => {
    const u = extractLink(text);
    if (!isBuildLink(u)) { setStatus({ ok: false, text: t("인피니티빌드(infinitybuilds.gg) 빌드 링크만 지원합니다. 예: infinitybuilds.gg/ko/builds/…", "Only InfinityBuilds (infinitybuilds.gg) build links are supported, e.g. infinitybuilds.gg/en/builds/…") }); return; }
    p.onLink(u);
  };
  const net = addr ? addr.ip.split(".").slice(0, 3).join(".") + ".x" : "…";
  return (
    <>
      <PanelSection title={t("휴대폰으로 링크 받기", "Get a link from your phone")}>
        <PanelSectionRow>
          {err ? <div className="d4-err">{t("수신 서버를 열지 못했습니다", "Couldn't open the receiver")}: {err}</div> : <>
            <div className="d4-qr" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="d4-addr">{addr ? `${addr.ip}:${addr.port}` : "…"}</div>
            <div className="d4-center" style={{ marginTop: 6 }}>{t("휴대폰 카메라로 스캔한 뒤 인피니티빌드 링크를 붙여넣으세요. 이 화면을 연 동안만, 이 QR을 찍은 휴대폰에서만 받습니다.", "Scan with your phone camera, then paste an InfinityBuilds link. Links are accepted only while this screen is open, and only from the phone that scanned this QR.")}</div>
          </>}
          <div className="d4-status"><span className={"d4-dot" + (status ? (status.ok ? " ok" : " bad") : "")} /><span>{status ? status.text : t("휴대폰 연결 대기 중", "Waiting for your phone")}</span></div>
        </PanelSectionRow>
      </PanelSection>
      <PanelSection title={t("또는 링크 직접 입력", "Or enter a link")}>
        <PanelSectionRow>
          <TextField label={t("인피니티빌드 빌드 링크", "InfinityBuilds build link")} value={text} onChange={e => setText(e.target.value)} description={t("infinitybuilds.gg 링크만 지원합니다. A를 누르면 Steam 키보드가 열리고, 붙여넣기는 Ctrl+V.", "infinitybuilds.gg links only. Press A for the Steam keyboard; paste with Ctrl+V.")} />
        </PanelSectionRow>
        <PanelSectionRow><Btn onActivate={submit}>{t("불러오기", "Load")}</Btn></PanelSectionRow>
      </PanelSection>
      <PanelSection>
        <PanelSectionRow>
          <div className="d4-note info">
            <div className="d4-note-h"><span>{t("휴대폰과 스팀덱을 같은 Wi-Fi에 연결하세요", "Put your phone and Steam Deck on the same Wi-Fi")}</span></div>
            <ul>
              <li>{t("휴대폰의 모바일 데이터(LTE/5G)로는 열리지 않습니다.", "It won't open over mobile data (LTE/5G).")}</li>
              <li>{t("게스트 Wi-Fi나 카페·호텔 Wi-Fi는 기기끼리 연결을 막는 경우가 많습니다.", "Guest, café and hotel Wi-Fi often block devices from reaching each other.")}</li>
            </ul>
          </div>
        </PanelSectionRow>
        <PanelSectionRow><Row onActivate={() => setHelp(!help)}><div className="d4-grow">{t("페이지가 안 열릴 때", "If the page won't open")}<div className="d4-sub">{t("확인할 것 3가지", "3 things to check")}</div></div><span className="d4-chev">{help ? "▾" : "▸"}</span></Row></PanelSectionRow>
        {help && <PanelSectionRow><div className="d4-list">
          <div className="d4-it"><span className="d4-n">1</span><span className="d4-v">{t("휴대폰 Wi-Fi 이름이 스팀덱과 같은지 확인하세요. 같은 공유기라도 게스트 네트워크면 안 됩니다.", "Check that your phone is on the same Wi-Fi name as the Deck. A guest network on the same router won't work.")}</span></div>
          <div className="d4-it"><span className="d4-n">2</span><span className="d4-v">{t(`휴대폰 IP가 ${net}로 시작하는지 확인하세요.`, `Check that your phone's IP starts with ${net}.`)}</span></div>
          <div className="d4-it"><span className="d4-n">3</span><span className="d4-v">{t("공유기 설정의 'AP 격리' 또는 '무선 기기 간 통신 차단'을 끄세요.", "Turn off 'AP isolation' (client isolation) in your router settings.")}</span></div>
        </div></PanelSectionRow>}
      </PanelSection>
    </>
  );
}

// ---------- loading ----------
function Loading({ job, onCancel }: { job: Job; onCancel: () => void }) {
  const t = tr(job.lang);
  return (
    <PanelSection title={t("빌드 받는 중", "Downloading build")}>
      <PanelSectionRow>
        <div className="d4-small d4-one">{job.url.replace(/^https?:\/\//, "")}</div>
        <div className="d4-bar"><div style={{ width: `${Math.round(job.pct)}%` }} /></div>
        <div className="d4-sub" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{job.done ? t("완료 · 빌드를 여는 중", "Done · opening build") : job.failed ? t("실패", "Failed") : job.steps[Math.min(job.step, 5)].t}</span><b>{Math.round(job.pct)}%</b>
        </div>
        {job.steps.map((s, i) => {
          const st = job.failed && s.err ? "fail" : i < job.step || job.done ? "done" : i === job.step ? "run" : "wait";
          return (
            <Fragment key={i}>
              <div className={"d4-step " + st}><span className="d4-st">{st === "done" ? "✓" : st === "fail" ? "!" : ""}</span>
                <div><div>{s.t}</div><div className="d4-sub">{i === 4 && st === "run" ? `${job.icons.length}/${job.total}` : s.d}</div></div></div>
              {s.err && <div className="d4-err">{s.err}</div>}
              {i === 4 && job.total > 0 && st !== "wait" && (
                <div className="d4-grid">{Array.from({ length: job.total }, (_, k) => <span key={k}>{job.icons[k] ? <img src={job.icons[k]} /> : null}</span>)}</div>
              )}
            </Fragment>
          );
        })}
      </PanelSectionRow>
      {!job.done && <PanelSectionRow><Btn onActivate={onCancel}>{job.failed ? t("닫기", "Close") : t("취소", "Cancel")}</Btn></PanelSectionRow>}
    </PanelSection>
  );
}

// ---------- delete confirm ----------
function Confirm(p: { ui: Lang; target: string; builds: BuildMeta[]; cur: { id: string; b: SavedBuild } | null; onYes: () => void; onNo: () => void }) {
  if (p.target === "reset") {
    const t = tr(p.ui);
    return (
      <PanelSection title={t("모두 초기화", "Reset everything")}>
        <PanelSectionRow>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, margin: "6px 0 10px" }}>{t("이 플러그인의 데이터를 모두 지울까요?", "Delete all of this plugin's data?")}</div>
          <div className="d4-del">
            <div><span>{t("저장된 빌드", "Saved builds")}</span><b>{p.builds.length}</b></div>
            <div><span>{t("이름 데이터셋 캐시", "Name dataset cache")}</span><b>✓</b></div>
            <div><span>{t("설정", "Settings")}</span><b>✓</b></div>
            <div><span>{t("로그", "Log")}</span><b>✓</b></div>
          </div>
          <div className="d4-small" style={{ margin: "8px 0" }}>{t("플러그인을 지울 때와 같은 정리를 하되, 플러그인은 그대로 남습니다. 되돌릴 수 없습니다.", "The same cleanup as uninstalling, but the plugin stays installed. This can't be undone.")}</div>
        </PanelSectionRow>
        <PanelSectionRow><Btn danger onActivate={p.onYes}>{t("모두 초기화", "Reset everything")}</Btn></PanelSectionRow>
        <PanelSectionRow><Btn onActivate={p.onNo}>{t("취소", "Cancel")}</Btn></PanelSectionRow>
      </PanelSection>
    );
  }
  const all = p.target === "all";
  const t = tr(all ? p.ui : (p.cur?.b.lang || p.ui));
  const list = all ? p.builds : p.builds.filter(b => b.id === p.target);
  const bytes = list.reduce((s, b) => s + b.bytes, 0), icons = list.reduce((s, b) => s + (b.icons || 0), 0);
  const nm = !all && p.cur ? (p.cur.b.data.title.length > 40 ? p.cur.b.data.title.slice(0, 40) + "…" : p.cur.b.data.title) : "";
  return (
    <PanelSection title={t("삭제 확인", "Confirm delete")}>
      <PanelSectionRow>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, margin: "6px 0 10px" }}>{all ? t(`저장된 빌드 ${list.length}개를 모두 삭제할까요?`, `Delete all ${list.length} saved builds?`) : t(`'${nm}' 빌드를 삭제할까요?`, `Delete '${nm}'?`)}</div>
        <div className="d4-del">
          <div><span>{t("빌드 파일", "Build files")}</span><b>{list.length}</b></div>
          <div><span>{t("포함된 아이콘", "Icons inside")}</span><b>{icons}</b></div>
          <div style={{ borderTop: "1px solid #2a323d", paddingTop: 4 }}><span>{t("합계", "Total")}</span><b>{kb(bytes)}</b></div>
        </div>
        <div className="d4-small" style={{ margin: "8px 0" }}>{t("빌드마다 파일 하나에 데이터와 아이콘이 모두 들어 있어 다른 빌드와 공유하는 파일이 없습니다. 지우면 남는 기록이 없고 되돌릴 수 없습니다.", "Each build is a single file with its icons inside, shared with nothing else. Deleting leaves nothing behind and can't be undone.")}</div>
      </PanelSectionRow>
      <PanelSectionRow><Btn danger onActivate={p.onYes}>{t("삭제", "Delete")}</Btn></PanelSectionRow>
      <PanelSectionRow><Btn onActivate={p.onNo}>{t("취소", "Cancel")}</Btn></PanelSectionRow>
    </PanelSection>
  );
}

// ---------- build ----------
function BuildView({ b, bytes, onDelete }: { b: SavedBuild; bytes: number; onDelete: () => void }) {
  const lang = b.lang, t = tr(lang), L = LL[lang], d = b.data, N = b.names;
  const [variant, setVariant] = useState(0);
  const [open, setOpen] = useState<Record<string, boolean>>({ overview: true, layout: true, gear: true });
  const [gearOpen, setGearOpen] = useState<Record<string, boolean>>({});
  const [showNotes, setShowNotes] = useState(true);
  const [short, setShort] = useState(false);
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const v: Variant = d.variants[variant] || d.variants[0];
  // variants: A / X on the variant row, LB / RB anywhere on the build screen
  const shift = (delta: number) => { const n = d.variants.length || 1; setVariant(x => (x + delta + n) % n); setNoteOpen({}); };
  const onBumper = (e: GamepadEvent) => {
    if (e.detail.button === BUMPER_LEFT) { shift(-1); e.stopPropagation(); }
    else if (e.detail.button === BUMPER_RIGHT) { shift(1); e.stopPropagation(); }
  };
  const K = (id: string | undefined, fb: string) => (id && N.map[id]) || fb;
  const skillName = (ic: string) => (!ic ? t("(비어 있음)", "(empty)") : N.icons[ic] || title(ic));
  const nodeName = (n: string) => { const x = N.sk[n]; if (!x) return "#" + n; return x[1] === "skill" ? x[0] : x[0] + " · " + x[2]; };
  const affLabel = (id: string) => { const s = shortAff(id), nm = N.map[id]; if (nm) return isRank(s) && !/등급|rank/i.test(nm) ? nm + t(" 등급", " Ranks") : nm; return title(s); };
  const skImg = (ic: string, cls = "") => (ic && b.icons.skills[ic] ? <img className={cls} src={b.icons.skills[ic]} /> : null);
  const toggle = (k: string) => setOpen({ ...open, [k]: !open[k] });

  const note = (key: string) => {
    if (!showNotes) return null;
    const n: NoteCard | undefined = (b.notes[variant] || {})[key];
    if (!n) return key === "overview" ? <div className="d4-note empty">{t("이 변형에는 작성자 설명이 없습니다.", "The author wrote no notes for this variant.")}</div> : null;
    const list = n.steps || n.items || [], isOpen = noteOpen[key] ?? !short;
    return (
      <Focusable className="d4-note" onActivate={() => setNoteOpen({ ...noteOpen, [key]: !isOpen })} onClick={() => setNoteOpen({ ...noteOpen, [key]: !isOpen })}>
        <div className="d4-note-h"><span>{n.title}</span><span className="d4-chev">{list.length}{t("줄", " lines")} {isOpen ? "▴" : "▾"}</span></div>
        {isOpen ? <ul>{list.map((x, i) => <li key={i}><Chips text={x} /></li>)}</ul> : <div className="d4-peek">{plain(list[0] || "")}</div>}
      </Focusable>
    );
  };
  const cnt = (n: number) => t(n + "개", String(n));

  // mechanic
  let mech: ReactNode = null;
  try {
    const m = v.mechanic ? JSON.parse(v.mechanic) : null;
    const lbl = (x: string) => N.mech[x] || title(x.replace(/\.pow$/, "").split("_").slice(-2).join(" "));
    if (m && m.type === "necromancer-book") {
      mech = <div className="d4-it"><span className="d4-k">{t("망자의 서", "Book of the Dead")}</span><span className="d4-v">{["warriors", "mages", "golem"].filter(k => m[k]).map(k => {
        const ty = (m[k].match(/_(Iron|Blood|Bone|Shadow|Cold|Reaper|Skirmisher|Defender)_/) || [])[1];
        return <div key={k}>{L.minion[k]} {ty ? L.minionType[ty] : ""} <span className="d4-sub">· {lbl(m[k]).replace(/^.* · /, "")}</span></div>;
      })}</span></div>;
    } else if (m) {
      const vals = Object.entries(m).filter(([k, x]) => k !== "type" && typeof x === "string" && /\.pow$/.test(x)).map(([, x]) => x as string);
      if (vals.length) mech = <div className="d4-it"><span className="d4-k">{t("클래스 기믹", "Mechanic")}</span><span className="d4-v">{lbl(vals[vals.length - 1])}</span></div>;
    }
  } catch (e) { mech = null; }

  const gear = v.gear.slice().sort((a, c) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(c.slot));
  const bp = pairs(v.boards).filter(x => x[0]);
  const boards: [string, number][] = [[bp.length ? bp[0][0].replace(/-\d+$/, "-00") : "", 0], ...bp];
  const glyphLabel = (g: string) => { const m = g.replace("glyph::rare-", "").match(/^(\d+)-(\w+)-(main|side)$/); return m ? `${L.stat[m[2]] || m[2]}(${m[3] === "main" ? t("주", "main") : t("보조", "side")})` : ""; };
  const pts = v.path.reduce((s, x) => s + x.n, 0);

  return (
    <Focusable flow-children="vertical" onButtonDown={onBumper}
      actionDescriptionMap={{ [BUMPER_LEFT]: t("이전 변형", "Previous variant"), [BUMPER_RIGHT]: t("다음 변형", "Next variant") }}>
      <PanelSection>
        <PanelSectionRow>
          <div className="d4-head">
            <div className="d4-cls">{L.cls[d.cls] || d.cls} · {t("시즌", "Season")} {d.season}</div>
            <div className="d4-title">{d.title}</div>
            <div className="d4-meta"><span>{d.author}</span><span>·</span><span>{t(d.updated + " 업데이트", "Updated " + d.updated)}</span><span>·</span><span>{t("한국어 (링크 기준)", "English (from link)")}</span></div>
            <div className="d4-chips">{d.activity.map(a => <span key={a} className="d4-pill">{L.act[a] || a}</span>)}{d.strengths.map(s => <span key={s} className="d4-pill str">{s}</span>)}</div>
          </div>
        </PanelSectionRow>
        <PanelSectionRow>
          <div className="d4-h" style={{ padding: "10px 6px 4px" }}><span>{t("변형", "Variant")}</span><span>LB / RB</span></div>
          <Focusable className="d4-row d4-var" onActivate={() => shift(1)} onClick={() => shift(1)} onSecondaryButton={() => shift(-1)}
            onOKActionDescription={t("다음 변형", "Next variant")} onSecondaryActionDescription={t("이전 변형", "Previous variant")}>
            <span className="d4-chev">◂</span>
            <div className="d4-grow"><span className="d4-sub" style={{ marginRight: 8 }}>{variant + 1}/{d.variants.length}</span><b>{v.name}</b></div>
            <span className="d4-chev">▸</span>
          </Focusable>
        </PanelSectionRow>
        <PanelSectionRow><ToggleField label={t("작성자 설명 보기", "Show author notes")} description={t("각 섹션 아래에 카드로 표시", "Cards under each section")} checked={showNotes} onChange={setShowNotes} /></PanelSectionRow>
        {showNotes && <PanelSectionRow><ToggleField label={t("첫 줄만 보기", "First line only")} description={t("A로 카드를 펼쳐 전체 보기", "Press A to expand a card")} checked={short} onChange={x => { setShort(x); setNoteOpen({}); }} /></PanelSectionRow>}
      </PanelSection>

      <PanelSection>
        {showNotes && <SecBlock open={open} toggle={toggle} k="overview" label={t("개요", "Overview")}>{note("overview")}</SecBlock>}

        <SecBlock open={open} toggle={toggle} k="layout" label={t("레이아웃", "Layout")}>
          <div className="d4-skillbar">{v.skills.map((s, i) => <div key={i} className="d4-sk">{skImg(s) || (s ? (lang === "ko" ? skillName(s).replace(/\s/g, "").slice(0, 2) : initials(s)) : "—")}<em>{i + 1}</em></div>)}</div>
          <div className="d4-list">
            {v.skills.map((s, i) => <div key={i} className="d4-it"><span className="d4-n">{i + 1}</span><span className="d4-v">{skImg(s, "d4-ico")}{skillName(s)}</span></div>)}
            {v.runes.length > 0 && <div className="d4-it"><span className="d4-k">{t("룬", "Runes")}</span><span className="d4-v">{v.runes.map(r => <div key={r}>{K(r, title(r.replace(/^item-(s15-)?rune-|-itm$/g, "").replace(/^(condition|effect)-/, "")))} <span className="d4-sub">({/condition/.test(r) ? t("조건", "condition") : t("효과", "effect")})</span></div>)}</span></div>}
            {mech}
          </div>
          {note("rotation")}
        </SecBlock>

        <SecBlock open={open} toggle={toggle} k="gear" label={t("장비", "Gear")} count={gear.length}>
          {note("gear")}
          <div className="d4-legend">{Object.keys(L.flag).map(k => <span key={k}><span className="d4-fl"><b className={k}>{k}</b></span> {L.flag[k]}</span>)}</div>
          {gear.map(g => {
            const key = variant + ":" + g.slot, k = L.kind[g.kind] || [g.kind, ""];
            const nm = g.kind === "custom_legendary" ? K(g.asp, g.name) : K(g.id, g.name);
            return (
              <Fragment key={key}>
                <Row onActivate={() => setGearOpen({ ...gearOpen, [key]: !gearOpen[key] })} style={{ paddingTop: 5, paddingBottom: 5 }}>
                  <span className="d4-slot">{L.slot[g.slot] || g.slot}</span>
                  <span className="d4-iicon" style={{ width: 32, height: 32 }}>{b.icons.items[g.id] ? <img src={b.icons.items[g.id]} /> : null}</span>
                  <div className="d4-grow"><div className="d4-nm">{nm}</div></div>
                  <span className={"d4-pill " + k[1]}>{k[0]}</span><span className="d4-chev">{gearOpen[key] ? "▾" : "▸"}</span>
                </Row>
                {gearOpen[key] && (
                  <div className="d4-affs">
                    {g.kind === "custom_legendary" && N.map[g.id] && <div className="d4-small">{t("베이스", "Base")}: {N.map[g.id]}</div>}
                    {triples(g.aff).map((a, i) => <div key={i} className="d4-aff"><span className="d4-val">{fmtVal(shortAff(a.id), a.v)}</span><span className="d4-lbl">{affLabel(a.id)}</span><span className="d4-fl">{a.f.split("").map(f => <b key={f} className={f}>{f}</b>)}</span></div>)}
                    <div className="d4-small">{t("명품화", "Masterwork")} {g.mw ?? 0}{g.sockets.length ? " · " + t("소켓", "Sockets") + ": " + g.sockets.map(s => K(s, title(s.replace(/^item-(s15-)?|-itm$/g, "")))).join(", ") : ""}</div>
                  </div>
                )}
              </Fragment>
            );
          })}
        </SecBlock>

        <SecBlock open={open} toggle={toggle} k="tree" label={t("스킬 트리 순서", "Skill tree order")} count={pts + "pt"}>
          {note("tree")}
          <div className="d4-list">{v.path.map((x, i) => {
            const isSkill = N.sk[x.id] && N.sk[x.id][1] === "skill";
            const ic = isSkill ? v.skills.find(s => s && N.icons[s] === N.sk[x.id][0]) : undefined;
            return <div key={i} className="d4-it"><span className="d4-n">{i + 1}</span><span className="d4-v" style={isSkill ? { fontWeight: 500 } : undefined}>{ic ? skImg(ic, "d4-ico") : null}{nodeName(x.id)}
              {x.n > 1 && <span style={{ color: "#d0673f", fontSize: 11 }}> ×{x.n}</span>}{x.r && <span className="d4-sub"> {t("· 나중에 회수", "· refunded later")}</span>}</span></div>;
          })}</div>
        </SecBlock>

        <SecBlock open={open} toggle={toggle} k="paragon" label={t("정복자 및 문양", "Paragon & glyphs")} count={cnt(boards.length)}>
          {note("paragon")}
          <div className="d4-list">{boards.map((bd, i) => {
            const gid = v.glyphs[bd[0]];
            return <div key={i} className="d4-it"><span className="d4-n">{i + 1}</span><span className="d4-v">{i === 0 ? t("시작 보드", "Starting board") : K(bd[0], t("보드 ", "Board ") + bd[0].replace(/.*-(\d+)$/, "$1"))}{i > 0 && <span className="d4-sub"> · {bd[1] * 90}°</span>}
              <div className="d4-sub">{t("문양", "Glyph")} {gid ? <>{K(gid, gid.replace("glyph::rare-", "#"))} <span style={{ fontSize: 10.5 }}>{glyphLabel(gid)}</span></> : t("없음", "none")}</div></span></div>;
          })}</div>
        </SecBlock>

        {(v.seal || v.charms.length > 0) && (
          <SecBlock open={open} toggle={toggle} k="talisman" label={t("부적", "Talismans")} count={cnt(v.charms.length)}>
            {note("talisman")}
            <div className="d4-list">
              <div className="d4-it"><span className="d4-k">{t("문장", "Seal")}</span><span className="d4-v">{K(v.seal, title(v.seal.replace(/^item-talisman-seal-|-itm$/g, "")))}</span></div>
              {v.charms.map((c, i) => <div key={i} className="d4-it"><span className="d4-k" /><span className="d4-v">{K(c, title(c.replace(/^Talisman_Charm_/, "")))}</span></div>)}
            </div>
          </SecBlock>
        )}

        {v.merc && v.merc.hired && (
          <SecBlock open={open} toggle={toggle} k="merc" label={t("용병", "Mercenaries")}>
            <div className="d4-list">
              <div className="d4-it"><span className="d4-k">{t("고용", "Hired")}</span><span className="d4-v">{L.merc[v.merc.hired] || v.merc.hired}</span></div>
              {v.merc.re && <div className="d4-it"><span className="d4-k">{t("지원", "Backup")}</span><span className="d4-v">{L.merc[v.merc.re] || v.merc.re}{v.merc.skill ? " · " + v.merc.skill : ""}
                {v.merc.trig && <div className="d4-sub">{L.trig[v.merc.trig] || v.merc.trig}{v.merc.trigSkill ? ": " + skillName(v.merc.trigSkill) : ""}</div>}</span></div>}
            </div>
          </SecBlock>
        )}

        <SecBlock open={open} toggle={toggle} k="etc" label={t("전쟁 계획 · 삼대 악마", "War Plan · Prime Evil")}>
          <div className="d4-list"><div className="d4-it"><span className="d4-k">{t("삼대 악마", "Prime Evil")}</span><span className="d4-v">{v.prime ? L.prime[v.prime] || v.prime : <span className="d4-sub">{t("지정 안 함", "not set")}</span>}</span></div></div>
          {note("etc")}
        </SecBlock>
      </PanelSection>

      <PanelSection title={t("원문", "Source")}>
        <PanelSectionRow><Row onActivate={() => { Navigation.NavigateToExternalWeb(withUtm(b.url)); Navigation.CloseSideMenus(); }}><div className="d4-grow">{t("오버레이 브라우저로 열기", "Open in the overlay browser")}<div className="d4-sub d4-one">{b.url.replace("https://", "")}</div></div><span className="d4-chev">↗</span></Row></PanelSectionRow>
        <PanelSectionRow><Btn danger onActivate={onDelete}>{t(`이 빌드 삭제 · ${kb(bytes)}`, `Delete this build · ${kb(bytes)}`)}</Btn></PanelSectionRow>
        <PanelSectionRow><div className="d4-small" style={{ padding: "6px" }}>{t("출처", "Source")}: InfinityBuilds · {d.author}. {t("이름은 InfinityTools 한국어 데이터셋 기준.", "Names from the InfinityTools English dataset.")}</div></PanelSectionRow>
      </PanelSection>
    </Focusable>
  );
}

// collapsible section; defined at module level so its rows keep focus across re-renders
function SecBlock({ k, label, count, children, open, toggle }: { k: string; label: string; count?: string | number; children: ReactNode; open: Record<string, boolean>; toggle: (k: string) => void }) {
  return (
    <>
      <PanelSectionRow><Row className="d4-sec" onActivate={() => toggle(k)}><div className="d4-grow">{label}</div><span className="d4-chev">{count !== undefined && count !== "" ? count + " " : ""}{open[k] ? "▾" : "▸"}</span></Row></PanelSectionRow>
      {open[k] && <PanelSectionRow>{children}</PanelSectionRow>}
    </>
  );
}
